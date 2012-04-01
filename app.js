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

  function fail(txt) {
    res.send(txt || 'Sorry, something went wrong. :(.');
  }

  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      fail();
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        fail();
        return;
      }

      collection.find({unique:req.params.id}, function(err, cursor) {
        if (err) {
          fail();
          return;
        }
        cursor.sort({time:-1}).toArray(function(err, items) {
          if (err) {
            fail();
            return;
          }
          if ('dl' in req.query)  {
            res.send(JSON.stringify(items));
          }
          else if ('drop' in req.query) {
            res.send('<a href="/view/' + req.params.id + '?reallydrop">Click here to delete your dream log.  This is permanent.</a>');
          }
          else if ('reallydrop' in req.query) {
            collection.remove({unique: req.params.id},function(err, obj) {
              if (err) {
                fail('Sorry, something went wrong. Please contact iwmiscs@gmail.com :(.');
              }
              else {
                res.send('ok');
              }
            });
          }
          else {
            res.render('view', {
              dreams: items,
            });
          }
        });
      });
    });
  });
});

/* Download dreams */
app.get('/download/:id', function(req, res) {
  function fail(txt) {
    res.send(txt || 'Sorry, something went wrong. :(.');
  }

  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      fail();
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        fail();
        return;
      }

      collection.find({unique:req.params.id}, function(err, cursor) {
        if (err) {
          fail();
          return;
        }
        cursor.sort({time:-1}).toArray(function(err, items) {
          if (err) {
            fail();
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
  var from = req.body.from;
  var text = req.body.text;

  gotemail(to, from, text);
  res.send('');
});

function gotemail(to, text, from) {
  console.log('Got email to', to, 'from', from);
  // send to mongo
  var startidx = Math.max(to.indexOf('<')+1, 0);
  var id = to.slice(startidx, to.indexOf('@'));

  // cut off text so we don't record original email
  var lines = text.split('\r\n');
  if (lines.length == 1)
    lines = text.split('\n');

  var includelines = [];
  for (var i=0; i < lines.length; i++) {
    var line = lines[i];
    //if (line.length > 0 && line[0] == '<')
      //break;
    if (line.indexOf(id) > -1 || line.indexOf(from) > -1) {
      break;
    }
    includelines.push(line);
  }
  dreamtext = includelines.join('\n');

  mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
    if (err) {
      return;
    }
    conn.collection('dreams', function(err, collection) {
      if (err) {
        return;
      }

      collection.insert({
        unique:id,
        text:dreamtext,
        time:new Date().getTime(),
        raw:text,
      }, function(err) {
        console.log('Recorded dream', id);
      });
    }); // end mongo collection
  }); // end mongo connection
}

var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log('Listening on', port);
});

