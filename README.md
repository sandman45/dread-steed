# dread-steed
    Module that helps handle a salesforce connection and all the fun mess that comes with salesforce..
    Ideally I would like it to add the ability to handle multiple connections in future versions.
## Installation
    npm install dread-steed --save
## Configuration
    pass this config object into dread steed

    var config = {
      maxConnDuration:10.000,
      maxRetries:2,
      errorTypes:['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE'],
      maxEventListeners:100,
      salesforce: {
        Username:        'salesforceapi@salesforce.com',
        Password:        'salesforcepassword',
        Endpoint:        'https://test.salesforce.com',//login.salesforce.com
        TargetSystem:    'Salesforce.com test sandbox',
        SecurityToken:   'thisisasecuritytoken',
        IntegrationName: 'SOMEINTEGRATIONNAME'
      }
    };
## Usage
    var DreadSteed = require('dread-steed');
    var dreadSteed = new DreadSteed(config);
    var yourSalesForceQueryHere = "SELECT id, Name FROM Things WHERE id = '1' ";

##Public functions
### queryAsync
    getAllTheThings = function(id){
        return dreadSteed.getConnection().then(function(conn){
            //use the connection!
            return conn.queryAsync(yourSalesForceQueryHere);
        }).catch(function(err){
            log.error(err);
            throw err;
        });
    }
### updateAsync
    updateAllTheThings = function( updateObj, name ) {
      return dreadSteed.getConnection().then(function(conn){
        return conn.updateAsync( name, updateObj ).then(function( res ){
          return res;
        }).catch(function( err ){
          log.error(err);
          throw err;
        });
      }).catch(function(err){
        log.error(err);
        throw err;
      });
    }
### createAsync
    createAllTheThings = function( newObj, name ) {
      return dreadSteed.getConnection().then(function(conn){
        return conn.createAsync(name, newObj).then(function(res) {
          return res;
        }).catch(function(err) {
          log.error(err);
          throw err;
        });
      }).catch(function(err) {
        log.error(err);
        throw err;
      });
    }
### deleteAsync
    deleteTheThing = function ( Id ) {
      return dreadSteed.getConnection()
        .then(function ( conn ) {
          return conn.deleteAsync( 'Things', Id );
        }).catch(function(err) {
           log.error(err);
           throw err;
        });
    };
##Tests
## Release History
    * 0.0.1 Initial release
    * 0.0.2
    * 0.0.3
    * 0.0.4 Config changes
    * 0.0.5 copyright added updated readme