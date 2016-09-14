/**
 * Created by matthew.sanders on 7/8/16.
 */
var assert = require('chai').assert;
var dreadsteed = require('../index');
var dreadsteedMock

describe('getConnection',function(){
  var ds;
  var conn;
  var query = 'SELECT id from Users';
  var queryUpdate = 'SELECT id from Users';
  before(function() {
    // runs before all tests in this block

    var config = {
      maxConnDuration:10.000,
      maxRetries:2,
      errorTypes:['INVALID_SESSION_ID','INVALID_LOGIN','DUPLICATE_VALUE','SERVER_UNAVAILABLE','REQUEST_LIMIT_EXCEEDED'],
      maxEventListeners:100,
      salesforce: {
        Username:        'salesforceapi@salesforce.com',
        Password:        'salesforcepassword',
        Endpoint:        'https://test.salesforce.com',
        SecurityToken:   'thisisasecuritytoken'
      }
    };

     ds = new dreadsteed(config);

  });

  it('should get the connection from salesforce', function(){
    ds.getConnection().then(function(_conn){
      conn = _conn;
      assert(conn !==conn.isObject,'Connection is not an Object');
    });
  });

  it('should call queryAsync', function(){
    conn.queryAsync(query).then(function(res){
      console.log(res);
    });
  });

  it('should call updateAsync', function(){

    conn.updateAsync(queryUpdate,{id:1,Phone:''}).then(function(res){
      console.log(res);
    });
  });


  after(function() {
    // runs after all tests in this block


  });

});
