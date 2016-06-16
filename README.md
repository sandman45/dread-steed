# dread-steed

Module that helps handle a salesforce connection and all the fun mess that comes with salesforce.

Ideally I would like it to add the ability to handle multiple connections in future versions.
## Installation
    npm install dread-steed --save
## Configuration

pass this config object into dread steed

```javascript
    var config = {
      maxConnDuration:10.000,
      maxRetries:2,
      errorTypes:['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE'],
      maxEventListeners:100,
      salesforce: {
        Username:        'salesforceapi@salesforce.com',
        Password:        'salesforcepassword',
        Endpoint:        'https://test.salesforce.com',//login.salesforce.com
        SecurityToken:   'thisisasecuritytoken',
      }
    };
```
For handling of multiple saleforce connections.  
NOTE: Api user will switch if it hits an api limit and throws SERVER_UNAVAILABLE 
otherwise it will just use the 1 api user

```javascript
    var config = {
      maxConnDuration:10.000,
      maxRetries:2,
      errorTypes:['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE','SERVER_UNAVAILABLE],
      maxEventListeners:100,
      salesforce: [
        {
            Username:        'salesforceapi@salesforce.com',
            Password:        'salesforcepassword',
            Endpoint:        'https://test.salesforce.com',//login.salesforce.com
            SecurityToken:   'thisisasecuritytoken',
        },
        {
            Username:        'salesforceapi2@salesforce.com',
            Password:        'salesforcepassword',
            Endpoint:        'https://test.salesforce.com',//login.salesforce.com
            SecurityToken:   'thisisasecuritytoken',
        },
        {
            Username:        'salesforceapi3@salesforce.com',
            Password:        'salesforcepassword',
            Endpoint:        'https://test.salesforce.com',//login.salesforce.com
            SecurityToken:   'thisisasecuritytoken',
        },
        {
            Username:        'salesforceapi4@salesforce.com',
            Password:        'salesforcepassword',
            Endpoint:        'https://test.salesforce.com',//login.salesforce.com
            SecurityToken:   'thisisasecuritytoken',
        }
      ]
    };
```


## Error Handling

Optional if you want to handle errors and or log then in your own way

```javascript
    var errorCallback = function(err){
        //err - object
    };
```

### Optional callbacks


If you want to use callbacks for more than just error handling, you can optionally pass in an object with a callback for error handling and a callback for when the salesforce connection is established or re-established.

```javascript
    var errorCallback = function(err){
        //err - object
    };

    var connectionCallback = function(conn){
        //conn - jsforce connection object
    }

    var callbacks = {
        onError: errorCallback,
        onConnection: connectionCallback
    };
```


## Usage
```javascript
    var DreadSteed = require('dread-steed');
    var dreadSteed = new DreadSteed(config, errorCallback); //OR new DreadSteed(config, callbacks);
    var yourSalesForceQueryHere = "SELECT id, Name FROM Things WHERE id = '1' ";
```
## Public functions
### queryAsync
```javascript
    getAllTheThings = function(id){
        return dreadSteed.getConnection().then(function(conn){
            //use the connection!
            return conn.queryAsync(yourSalesForceQueryHere);
        }).catch(function(err){
            log.error(err);
            throw err;
        });
    }
```
### updateAsync
```javascript
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
```
### createAsync
```javascript
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
```

### deleteAsync
```javascript
    deleteTheThing = function ( Id ) {
      return dreadSteed.getConnection()
        .then(function ( conn ) {
          return conn.deleteAsync( 'Things', Id );
        }).catch(function(err) {
           log.error(err);
           throw err;
        });
    };
```

## Tests
## Release History
* 0.0.1 Initial release
* 0.0.2
* 0.0.3
* 0.0.4 Config changes
* 0.0.5 copyright added updated readme
* 0.0.6 error handle callback
* 0.0.7 removed unused salesforce config from README.md
* 0.0.8 allow optional callback for successful salesforce connections/re-connections