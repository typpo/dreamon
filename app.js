var express = require('express')
  , app = express.createServer()
  , _ = require('underscore')
  , mongo = require('mongodb')
  , connect = require('connect')
  , validator = require('validator')
  , mailer = require('mailer')
  , config = require('./config.js')

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
  var tz = req.body.tz;

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
    conn.collection('people', function(err, collection) {
      if (err) {
        res.send({success: false, msg: 'Could not connect to database collection.'});
        return;
      }

      collection.update({email:email}, {email:email, tz:tz}, {upsert:true}, function(err) {
        if (err) {
          res.send({success: false, msg: 'Could not update database.'});
          return;
        }
        res.send({success: true});
      });
    }); // end mongo collection
  }); // end mongo connection


});

/* View dreams */
app.get('/view/:id', function(req, res) {
  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      res.send('Sorry, something went wrong. :(.');
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        res.send('Sorry, something went wrong. :(.');
        return;
      }

      collection.find({unique:req.params.id}, function(err, cursor) {
        if (err) {
          res.send('Sorry, something went wrong. :(.');
          return;
        }
        cursor.sort({time:-1}).toArray(function(err, items) {
          if (err) {
            res.send('Sorry, something went wrong. :(.');
            return;
          }
          res.render('view', {
            dreams: items,
          });
        });
      });
    });
  });
});

/* Unsubscribe */
app.get('/unsub/:id', function(req, res) {
  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
      return;
    }
    conn.collection('people', function(err, collection) {
      if (err) {
        res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
        return;
      }
      var id;
      try {
        id = new mongo.ObjectID(req.params.id);
      }
      catch(e) {
        res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
        return;
      }
      collection.remove({_id: id},function(err, obj) {
        if (err) {
          res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
        }
        else {
          res.send('Successfully removed.');
        }
      });
    });
  });
});

/* Received an email */
app.post('/parse', function(req, res) {
  var to = req.body.to;
  var text = req.body.text;

  gotemail(to, text);
  res.send('');
});

function gotemail(to, text) {
  console.log('Got email from', to);

  var id = to.slice(0, to.indexOf('@'));

  // send to mongo
  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        return;
      }

      collection.insert({unique:id, text:text, time:new Date().getTime()}, function(err) {
        console.log('Recorded dream', id);
      });
    }); // end mongo collection
  }); // end mongo connection
}

var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log('Listening on', port);

});
