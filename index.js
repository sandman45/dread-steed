/**
 MIT License
 Copyright (c) 2016, Matthew W. Sanders <msanders45@gmail.com>

 Permission is hereby granted, free of charge, to any person
 obtaining a copy of this software and associated documentation
 files (the "Software"), to deal in the Software without
 restriction, including without limitation the rights to use,
 copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the
 Software is furnished to do so, subject to the following
 conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
 OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
 OTHER DEALINGS IN THE SOFTWARE.
*/

/**
 * DREADSTEED
 * Created by matthew.sanders on 9/18/15.
 */
'use strict';
var config;
var jsforce = require('jsforce');
var moment = require('moment');
var promise = require('bluebird');
var _ = require('lodash');
var uuid = require('node-uuid');
var EventEmitter = require('events').EventEmitter;
var ee = new EventEmitter();
var conn = null;
var checkConn = false;
var initialized = moment().valueOf();
var silent = false;
var connectionRequests = [];
var maxConnDuration;
var maxRetries;
var errorTypes;
var apiUsers = [];
var apiCounter = 0;
var currentApiUser = {};
var multipleApiUsers = false;
var callbacks = {
  onError: function(){},
  onConnection: function(){}
};
/**
 * Pool
 * @constructor
 */
function Pool( _config, _callbacksConfig ) {
  if( _config ){
    config = _config;
    silent = config.silent;
    ee.setMaxListeners( config.maxEventListeners );
    maxConnDuration = config.maxConnDuration;
    maxRetries = config.maxRetries;
    errorTypes = config.errorTypes;

    if(_.isFunction(_callbacksConfig)){
      _callbacksConfig = {
        onError: _callbacksConfig //set onError callback to _callbacksConfig if _callbacksConfig is a function for backwards compatibility
      }
    } else if(!_.isObject(_callbacksConfig)){
      _callbacksConfig = {}; //set to empty object if not an object;
    }

    if( _.isArray(config.salesforce) && config.salesforce.length > 1 ){
      multipleApiUsers = true;
      apiUsers = config.salesforce;
    }else if(_.isObject(config.salesforce)){
      apiUsers = [config.salesforce];
    }else{
      throw new Error('Salesforce configuration is not set.');
    }

    _.assign(callbacks, _callbacksConfig);

    battlecry('[ DREADSTEED CONN POOL - Instantiating Pool ]');
    connectionLogin()
      .then(function () {

      })
      .catch(function ( err ) {
        battlecry('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready: ' + err.message );
        handleError(err);
        throw err;
      });

  }else{
    throw new Error('Configuration has not been set!');
  }
}

/**
 * Outputs status messages to console if config.silent == false 
 * @param status 
 * @returns 
 */
function battlecry (status) {
  if(silent) {
    return;
  }
  console.log(status);
}

/**
 * event listener for sales-force-logged-in
 */
ee.on('sales-force-logged-in', function(){
  battlecry('[ DREADSTEED CONN POOL - Create Connection ] Salesforce Connection Ready');
  ee.removeListener('sales-force-logged-in', function(){
    battlecry('[ DREADSTEED CONN POOL - Connection Ready ] ');
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
      battlecry('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready');
      battlecry( err );
      def.reject(err);
    });
  }else {
    checkConnection( {request:'salesforce', uuid:createUUID()} ).then(function( renew ){
      if( !renew ){
        def.resolve( attachConnFunctions( conn ) ); //return connection asap
      }else{
        connectionLogin().then(function () {

          def.resolve( attachConnFunctions( conn ) );
        }).catch(function( err ){
          battlecry('[ DREADSTEED CONN POOL - ERROR ] Salesforce Connection NOT Ready');
          battlecry( err );
          def.reject(err);
        });
      }
    }).catch(function( err ){
      battlecry('[ DREADSTEED CONN POOL - ERROR ] Connection Duration Error');
      battlecry( err );
      def.reject(err);
    });
  }
  return def.promise;
};

/**
 * connectionLogin
 * @returns {*}
 */
function connectionLogin(switchApiUser) {
  var def = promise.defer();
  battlecry('[ DREADSTEED CONN POOL - Create Connection ] Creating Salesforce Connection');
  //need to be able to swap out user apis
  if(switchApiUser){
    apiCounter++;
    if( apiCounter > apiUsers.length ){
      apiCounter = 0;
    }
    battlecry('[ DREADSTEED CONN POOL - Switching Api User ] From: ' + currentApiUser.Username);
    currentApiUser = apiUsers[apiCounter];
    battlecry('[ DREADSTEED CONN POOL - Switching Api User ] To: ' + currentApiUser.Username);
  }else{
    currentApiUser = apiUsers[0];
    battlecry('[ DREADSTEED CONN POOL - Api User ] : ' + currentApiUser.Username);
  }

  conn = new jsforce.Connection({
    loginUrl: currentApiUser.Endpoint,
    accessToken: currentApiUser.SecurityToken
  });

  conn.login( currentApiUser.Username, currentApiUser.Password + currentApiUser.SecurityToken, function ( err ) {
    if ( err ) {
      checkConn = false;
      conn = null;
      battlecry('[ DREADSTEED CONN POOL - ERROR ] : ' + err.message);
      battlecry('[ DREADSTEED CONN POOL - ERROR ] Destroying Connection');

      _.each(connectionRequests, function(req){
        ee.emit('sales-force-reconnect-'+req.uuid, {loggedIn:false, uuid:req.uuid});
      });
      //clear out our connection requests
      if(connectionRequests.length > 0){
        connectionRequests = [];
      }

      def.reject(err);

    } else {
      callbacks.onConnection();
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
      callbacks.onConnection(conn);
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
    battlecry('[ DREADSTEED CONN POOL - Connection ] Session has been expired.');
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
    battlecry('[ DREADSTEED CONN POOL ] Duration of Connection : ' + calcDur + ' hours');
    if ( calcDur >= maxConnDuration ){
      battlecry('[ DREADSTEED CONN POOL ] Duration of Connection : ' + calcDur + ' hours');
      battlecry('[ DREADSTEED CONN POOL ] Logging out Connection at : ' + calcDur);
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
        battlecry('[ DREADSTEED CONN POOL - ERROR ] Cannot process request ' + request.uuid + ' : ' + obj.uuid + ', logged in:' + obj.loggedIn);
        //TODO: return true which would retry the connection?
      }else{
        battlecry('[ DREADSTEED CONN POOL - Connection Re-Established ] Processing request ' + request.uuid + ' : ' + obj.uuid + ', logged in:' + obj.loggedIn);
      }

      ee.removeListener('sales-force-reconnect-'+request.uuid, function(){
        battlecry('[ DREADSTEED CONN POOL EVENTS] Remove Listener : ' + request.uuid + ' ');
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
  var switchApiUser = false;

  _.each( errorTypes, function( type ){
    if(err.errorCode === type || err.name === type || err.message.search( type ) !== -1 ){
      errorType = type;
    }
  });

  switch( errorType ){
    case 'INVALID_SESSION_ID' : retry = true; break;
    case 'INVALID_LOGIN' : retry = false; break;
    case 'DUPLICATE_VALUE' : retry = false; break;
    case 'SERVER_UNAVAILABLE': retry = multipleApiUsers; switchApiUser = multipleApiUsers; break;
    case 'REQUEST_LIMIT_EXCEEDED': retry = multipleApiUsers; switchApiUser = multipleApiUsers; break;
  }

  battlecry('[ DREADSTEED CONN POOL - Error Type ] : ' + errorType);

  if(retry === false) {
    callbacks.onError( err );
  }

  return { retry: retry, switchApiUser: switchApiUser };
}

/**
 * deathRattle
 * @param err
 * @param queryObj
 * @param retryCount
 * @returns {*}
 */
function deathRattle( err, queryObj, retryCount, switchApiUser ){
  battlecry('[ DREADSTEED CONN POOL - DEATH RATTLE ] Retrying query: ' + retryCount + ', err : ' + err);

  var success = function(res){
    battlecry('[ DREADSTEED CONN POOL - DEATH RATTLE ] Success on retry: ' + retryCount + ' from err : ' + err);
    return res;
  };
  var error = function (err) {
    battlecry('[ DREADSTEED CONN POOL - DEATH RATTLE ] Error on retry: ' + retryCount + ' from err : ' + err);
    throw err;
  };
  if( err && retryCount < maxRetries ){
    //redo the connection
    return connectionLogin(switchApiUser).then(function(){
      if(queryObj.query){
        return reRunQuery( queryObj.query ).then(success()).catch(error());
      }else if(queryObj.updateObj){
        return reRunUpdate( queryObj.name, queryObj.updateObj ).then(success()).catch(error());
      }else if(queryObj.createObj){
        return reRunCreate( queryObj.name, queryObj.createObj ).then(success()).catch(error());
      }else if(queryObj.deleteObj){
        return reRunDelete( queryObj.name, queryObj.deleteObj ).then(success()).catch(error());
      }
    }).catch(function( err ){
      retryCount++;
      return deathRattle( err, queryObj, retryCount );
    });
  }else {
    battlecry('[ DREADSTEED CONN POOL - ERROR ] No Error or Max Retry Exceeded');
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
          var handlerResult = handleError(err);
          if(handlerResult.retry){
            deathRattle( err, {query:query}, 0, handlerResult.switchApiUser).then( function( res ){
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
          var handlerResult = handleError(err);
          if(handlerResult.retry){
            deathRattle( err, {name:name, updateObj:updateObj}, 0, handlerResult.switchApiUser ).then( function( res ){
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
          var handlerResult = handleError(err);
          if(handlerResult.retry){
            deathRattle( err, {name:name, createObj:createObj}, 0, handlerResult.switchApiUser ).then( function( res ){
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
          var handlerResult = handleError(err);
          if(handlerResult.retry){
            deathRattle( err, {name:name, deleteObj:id}, 0, handlerResult.switchApiUser ).then( function( res ){
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
