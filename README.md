# dread-steed
Module that helps handle a salesforce connection and all the fun mess that comes with salesforce
## Installation

    npm install dread-steed --save
## Usage

    var DreadSteed = require('dread-steed');
    var dreadSteed = new DreadSteed();
    var yourSalesForceQueryHere = "SELECT id, Name FROM Things WHERE id = '1' ";
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

    * 0.1.0 Initial release