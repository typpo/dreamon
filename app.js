var express = require('express')
  , app = express.createServer()
  , mongo = require('mongodb')
  , ObjectID = require('mongodb').ObjectID
  , connect = require('connect')
  , validator = require('validator')

// Express config
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.use(express.cookieParser());
//var RedisStore = require('connect-redis')(express);
//app.use(express.session({secret: "some key", store: new RedisStore}));
app.use(express.static(__dirname + '/public'));
app.use(express.bodyParser());
app.use(connect.compress());

// App

/* Homepage */
app.get('/', function(req, res) {
  res.render('index', {

  });
});

/* New signup */
app.post('/signup', function(req, res) {
  var email = req.body.email;

  // check email
  try {
    validator.check(email).isEmail();
  }
  catch(ex) {
    res.send({success: false, msg: 'Invalid email.'});
    return;
  }

  // send to mongo
  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      res.send({success: false, msg: 'Could not connect to database.'});
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        res.send({success: false, msg: 'Could not connect to database collection.'});
        return;
      }

      collection.findOne({'email': email}, function(err, found) {
        if (err || !found) {
          // good. Now we add the new email
          collection.insert({'email': email}, function(err, obj) {
            if (err) {
              res.send({success: false, msg: 'Could not update database.'});
              return;
            }
            res.send({success: true});
          });
        }
        else {
          // This email already exists
          res.send({success:true, msg: 'This email already exists in our database.'});
        }
      });
    }); // end mongo collection
  }); // end mongo connection


});


var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log('Listening on', port);

});
