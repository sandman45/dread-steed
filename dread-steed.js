/**
 * DREADSTEED
 * Created by matthew.sanders on 9/18/15.
 */
'use strict';
var configSF = require('config').salesforceGemini;
var jsforce = require('jsforce');
var moment = require('moment');
var log = require.main.require('vs-utils').Bunyan.getLogger('DREADSTEED');
var promise = require('bluebird');
var _ = require('lodash');
var uuid = require('node-uuid');

var EventEmitter = require('events').EventEmitter;
var ee = new EventEmitter();
ee.setMaxListeners(100); //

var conn = null;
var checkConn = false;
var initialized = moment().valueOf();

var connectionRequests = [];
var maxConnDuration = 10.000;
var maxRetries = 2;
var errorTypes = ['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE'];
var error = require('./gemini/systemError');

/**
 * Pool
 * @constructor
 */
function Pool() {
  log.info('[ DREADSTEED CONN POOL - Instantiating Pool ]');
  connectionLogin()
    .then(function () {

    })
    .catch(function ( err ) {
      log.error('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready: ' + err.message );
      handleError(err);
      throw err;
    });
}

/**
 * event listener for sales-force-logged-in
 */
ee.on('sales-force-logged-in', function(){
  log.info('[ DREADSTEED CONN POOL - Create Connection ] Salesforce Connection Ready');
  ee.removeListener('sales-force-logged-in', function(){
    //log.info('[ DREADSTEED CONN POOL - Connection Ready ] ');
  });
});

/**
 * getConnection
 * @returns {*}
 */
Pool.prototype.getConnection = function () {
  var def = promise.defer();
  if ( !conn ) {
    connectionLogin().then(function () {
      def.resolve( attachConnFunctions( conn ) );
    }).catch(function( err ){
      log.error('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready');
      log.error( err );
      def.reject(err);
    });
  }else {
    checkConnection( {request:'salesforce', uuid:createUUID()} ).then(function( renew ){
      if( !renew ){
        def.resolve( attachConnFunctions( conn ) ); //return connection asap
      }else{
        connectionLogin().then(function () {
          deleteSalesforceErrors();
          def.resolve( attachConnFunctions( conn ) );
        }).catch(function( err ){
          log.error('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready');
          log.error( err );
          def.reject(err);
        });
      }
    }).catch(function( err ){
      log.error('[ DREADSTEED CONN POOL - ERROR ] Connection Duration Error');
      log.error( err );
      def.reject(err);
    });
  }
  return def.promise;
};

/**
 * connectionLogin
 * @returns {*}
 */
function connectionLogin() {
  var def = promise.defer();
  log.info('[ DREADSTEED CONN POOL - Create Connection ] Creating Salesforce Connection');
  conn = new jsforce.Connection({
    loginUrl: configSF.Endpoint,
    accessToken: configSF.SecurityToken
  });

  conn.login( configSF.Username, configSF.Password + configSF.SecurityToken, function ( err ) {
    if ( err ) {
      checkConn = false;
      conn = null;
      log.error('[ DREADSTEED CONN POOL - ERROR ] : ' + err.message);
      log.error('[ DREADSTEED CONN POOL - ERROR ] Destroying Connection');

      _.each(connectionRequests, function(req){
        ee.emit('sales-force-reconnect-'+req.uuid, {loggedIn:false, uuid:req.uuid});
      });
      //clear out our connection requests
      if(connectionRequests.length > 0){
        connectionRequests = [];
      }

      def.reject(err);

    } else {
      deleteSalesforceErrors();
      initialized = moment().valueOf();
      checkConn = false;

      ee.emit('sales-force-logged-in');

      _.each(connectionRequests, function(req){
        ee.emit('sales-force-reconnect-'+req.uuid, {loggedIn:true, uuid:req.uuid});
      });

      //clear out our connection requests
      if(connectionRequests.length > 0){
        connectionRequests = [];
      }

      def.resolve(conn);
    }
  });
  return def.promise;
}

/**
 * connectionLogout
 * @returns {d.promise}
 */
function connectionLogout(){
  var d = promise.defer();
  conn.logout(function ( err ) {
    if( err ) {
      conn = null;
      checkConn = false;

      if( handleError( err ) ){
        d.resolve( true );
      }else{
        d.reject( err );
      }
    }
    log.info('[ DREADSTEED CONN POOL - Connection ] Session has been expired.');
    d.resolve(true);
  });
  return d.promise;
}

/**
 * checkConnection
 * @param request
 * @returns {d.promise}
 */
function checkConnection( request ) {
  var d = promise.defer();
  //hey im already checking the connection no need to run it again but lets resolve once the connection is re-established
  if( !checkConn ){
    checkConn = true;
    var calcDur = checkDuration();
    log.info('[ DREADSTEED CONN POOL ] Duration of Connection : ' + calcDur + ' hours');
    if ( calcDur >= maxConnDuration ){
      log.info('[ DREADSTEED CONN POOL ] Duration of Connection : ' + calcDur + ' hours');
      log.info('[ DREADSTEED CONN POOL ] Logging out Connection at : ' + calcDur);
      connectionLogout().then(function( renew ){
        d.resolve( renew );
      }).catch(function( err ){
        d.reject( err );
      });
    }else{
      checkConn = false;
      d.resolve(false);
    }
  }else{
    //listening for the connection event before we resolve the promise
    connectionRequests.push( request );

    /**
     * event listener for the specified sales-force-reconnect-*UUID*
     */
    ee.on('sales-force-reconnect-'+request.uuid, function( obj ){
      if(!obj.loggedIn){
        log.error('[ DREADSTEED CONN POOL - ERROR ] Cannot process request ' + request.uuid + ' : ' + obj.uuid + ', logged in:' + obj.loggedIn);
        //TODO: return true which would retry the connection?
      }else{
        log.info('[ DREADSTEED CONN POOL - Connection Re-Established ] Processing request ' + request.uuid + ' : ' + obj.uuid + ', logged in:' + obj.loggedIn);
      }

      ee.removeListener('sales-force-reconnect-'+request.uuid, function(){
        log.info('[ DREADSTEED CONN POOL EVENTS] Remove Listener : ' + request.uuid + ' ');
      });

      d.resolve(false);

    });
  }
  return d.promise;
}

/**
 * handleError
 * @param err
 * @returns {boolean}
 */
function handleError( err ){
  var errorType = 'Unknown Error Type.  Not found in expected errors array';
  var retry = false;

  _.each( errorTypes, function( type ){
    if(err.errorCode === type || err.name === type || err.message.search( type ) !== -1 ){
      errorType = type;
    }
  });

  switch( errorType ){
    case 'INVALID_SESSION_ID' : retry = true; break;
    case 'INVALID_LOGIN' : retry = false; break;
    case 'DUPLICATE_VALUE' : retry = false; break;
  }

  log.error('[ DREADSTEED CONN POOL - Error Type ] : ' + errorType);

  writeSystemError(errorType);

  return retry;
}

/**
 * writeSystemError
 * @param errorType
 * @returns
 */
function writeSystemError(errorType) {
  var now = new Date().valueOf();
  var entries = [];
  var body = 'Error connecting to SalesForce.';
	var sysId = 'SALESFORCE';
	entries.push({ name: 'cushion', type: errorType, userMessage: { title: 'Problem getting your agenda', body: body }, timestamp: now });
	return error.insert(sysId, null, entries);
}

function deleteSalesforceErrors() {
  return error.deleteBySystem(['SALESFORCE']);
}

/**
 * deathRattle
 * @param err
 * @param queryObj
 * @param retryCount
 * @returns {*}
 */
function deathRattle( err, queryObj, retryCount ){
  log.info('[ DREADSTEED CONN POOL - DEATH RATTLE ] Retrying query: ' + retryCount + ', err : ' + err);
  if( err && retryCount < maxRetries ){
    //redo the connection
    return connectionLogin().then(function(){
      if(queryObj.query){
        return reRunQuery( queryObj.query ).then(function( res ){
          log.info('[ DREADSTEED CONN POOL - DEATH RATTLE ] Success on retry: ' + retryCount + ' from err : ' + err);
          return res;
        }).catch(function( err ){
          log.error('[ DREADSTEED CONN POOL - DEATH RATTLE ] Error on retry: ' + retryCount + ' from err : ' + err);
          throw err;
        });
      }else if(queryObj.updateObj){
        return reRunUpdate( queryObj.name, queryObj.updateObj ).then(function( res ){
          log.info('[ DREADSTEED CONN POOL - DEATH RATTLE ] Success on retry: ' + retryCount + ' from err : ' + err);
          return res;
        }).catch(function( err ){
          log.error('[ DREADSTEED CONN POOL - DEATH RATTLE ] Error on retry: ' + retryCount + ' from err : ' + err);
          throw err;
        });
      }else if(queryObj.createObj){
        return reRunCreate( queryObj.name, queryObj.createObj ).then(function( res ){
          log.info('[ DREADSTEED CONN POOL - DEATH RATTLE ] Success on retry: ' + retryCount + ' from err : ' + err);
          return res;
        }).catch(function( err ){
          log.error('[ DREADSTEED CONN POOL - DEATH RATTLE ] Error on retry: ' + retryCount + ' from err : ' + err);
          throw err;
        });
      }else if(queryObj.deleteObj){
        return reRunDelete( queryObj.name, queryObj.deleteObj ).then(function( res ){
          log.info('[ DREADSTEED CONN POOL - DEATH RATTLE ] Success on retry: ' + retryCount + ' from err : ' + err);
          return res;
        }).catch(function( err ){
          log.error('[ DREADSTEED CONN POOL - DEATH RATTLE ] Error on retry: ' + retryCount + ' from err : ' + err);
          throw err;
        });
      }
    }).catch(function( err ){
      retryCount++;
      return deathRattle( err, queryObj, retryCount );
    });
  }else {
    log.error('[ DREADSTEED CONN POOL - ERROR ] No Error or Max Retry Exceeded');
    throw err;
  }
}

/**
 * reRunQuery
 * runs query and returns results
 * @param query
 * @returns {d.promise}
 */
function reRunQuery( query ){
  var d = promise.defer();
  conn.query( query, function ( err, res ) {
    if( err ) {
      d.reject( err );
    }
    d.resolve( res );
  });
  return d.promise;
}

/**
 * reRunUpdate
 * runs sobjectUpdate and returns results
 * @param updateObj
 * @returns {d.promise}
 */
function reRunUpdate( name, updateObj ){
  var d = promise.defer();
  conn.sobject( name ).update( updateObj,  function ( err, res ) {
    if( err ) {
      d.reject( err );
    }
    d.resolve( res );
  });
  return d.promise;
}

/**
 * reRunCreate
 * runs sobjectCreate and returns results
 * @param query
 * @returns {d.promise}
 */
function reRunCreate( name, createObj ){
  var d = promise.defer();
  conn.sobject( name ).create( createObj, function ( err, res ) {
    if( err ) {
      d.reject( err );
    }
    d.resolve( res );
  });
  return d.promise;
}

/**
 * reRunDelete
 * runs sobjectDelete and returns results
 * @param query
 * @returns {d.promise}
 */
function reRunDelete( name, id ){
  var d = promise.defer();
  conn.sobject( name ).delete( id, function ( err, res ) {
    if( err ) {
      d.reject( err );
    }
    d.resolve( res );
  });
  return d.promise;
}

/**
 * attachConnFunctions
 * @param conn
 * @returns {*}
 */
function attachConnFunctions( conn ){
  attachQueryAsync( conn );
  attachCreateAsync( conn );
  attachUpdateAsync( conn );
  attachDeleteAsync( conn );
  return conn;
}
/**
 * attachQueryAsync
 * @param conn
 * @returns {*}
 */
function attachQueryAsync( conn ) {
  if( !conn.queryAsync ) {
    conn.queryAsync = function ( query ) {
      var d = promise.defer();
      conn.query( query, function ( err, res ) {
        if( err ) {
          if(handleError(err)){
            deathRattle( err, {query:query}, 0).then( function( res ){
              d.resolve( res );
            }).catch(function( err ){
              d.reject( err );
            });
          }else{
            d.reject( err );
          }
        }else{
          d.resolve( res );
        }
      });
      return d.promise;
    };
  }
  return conn;
}

/**
 * attachUpdateAsync
 * @param conn
 * @returns {*}
 */
function attachUpdateAsync( conn ){
  if( !conn.updateAsync ) {
    conn.updateAsync = function ( name, updateObj ) {
      var d = promise.defer();
      conn.sobject( name ).update( updateObj, function( err, res ){
        if ( err ) {
          if(handleError(err)){
            deathRattle( err, {name:name, updateObj:updateObj}, 0 ).then( function( res ){
              d.resolve( res );
            }).catch(function( err ){
              d.reject( err );
            });
          }else{
            d.reject( err );
          }
        }else{
          d.resolve( res );
        }
      });
      return d.promise;
    };
  }
  return conn;
}

/**
 * attachCreateAsync
 * @param conn
 * @returns {*}
 */
function attachCreateAsync( conn ){
  if( !conn.createAsync ) {
    conn.createAsync = function ( name, createObj ) {
      var d = promise.defer();
      conn.sobject( name ).create( createObj, function( err, res ){
        if ( err ) {
          if(handleError(err)){
            deathRattle( err, {name:name, createObj:createObj}, 0 ).then( function( res ){
              d.resolve( res );
            }).catch(function( err ){
              d.reject( err );
            });
          }else{
            d.reject( err );
          }
        }else{
          d.resolve( res );
        }
      });
      return d.promise;
    };
  }
  return conn;
}

/**
 * attachDeleteAsync
 * @param conn
 * @returns {*}
 */
function attachDeleteAsync( conn ){
  if( !conn.deleteAsync ) {
    conn.deleteAsync = function ( name, id ) {
      var d = promise.defer();
      conn.sobject( name ).delete( id, function( err, res ){
        if ( err ) {
          if(handleError(err)){
            deathRattle( err, {name:name, deleteObj:id}, 0 ).then( function( res ){
              d.resolve( res );
            }).catch(function( err ){
              d.reject( err );
            });
          }else{
            d.reject( err );
          }
        }else{
          d.resolve( res );
        }
      });
      return d.promise;
    };
  }
  return conn;
}


/**
 * checkDuration
 * @returns {number}
 */
function checkDuration(){
  var dur = moment().valueOf() - initialized.valueOf();
  var calcDur = (dur / (60 * 1000 * 60)).toFixed(3);
  return calcDur;
}

/**
 * createUUID
 * @returns {*}
 */
function createUUID(){
  return uuid.v1();
}

module.exports = Pool;
