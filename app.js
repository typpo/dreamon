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

function gotemail(to, from, text) {
  console.log('Got email to', to, 'from', from);
  // send to mongo
  var startidx = Math.max(to.indexOf('<')+1, 0);
  var id = to.slice(startidx, to.indexOf('@'));

  // cut off text so we don't record original email

  /*
  var responseidx = text.indexOf(id);
  var dreamtext = text;
  if (responseidx > -1) {
    dreamtext = dreamtext.slice(0, responseidx);
  }
  */

  var lines = text.split('\r\n');
  // We have to join lines that are separated by only one break.
  // This is because the 'original message' line may be separated, and
  // we need to kill it.
  if (lines.length == 1) {
    dreamtext = text.replace('\n\n', '<{{double}}>').replace('\n', ' ');
    lines = dreamtext.split('<{{double}}>');
  }
  else {
    dreamtext = text.replace('\r\n\r\n', '<{{double}}>').replace('\r\n', ' ');
    lines = dreamtext.split('<{{double}}>');
  }

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

//gotemail('testing@keepdream.me', 'testing@keepdream.me', "another fucking test\n\nOn Sun, Apr 1, 2012 at 3:32 AM, Dream On <\ntesting@keepdream.me> wrote:\n\n> Good morning!\n>\n> Respond to this email with last night's dreams and we'll record them for\n> you..\n>\n> Sincerely, DreamOn (http://keepdream.me/<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRu5tmj1qOBjfYJS4azSHcWg-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYxV6ojB1fpdS5LsOm1jU8GOO7r-2BrPmJQ2ws178X9maCIaJaYY1G5HVQBhwx-2BAmFRAdB8keFkYHCuQ-2BqStlEnC1BA-3D-3D>\n> )\n>\n> View past dreams: http://keepdream.me/view/4f77ed3860c258a567aeabf8<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRru5Yfa-2FZdfrkTI2NHJQcbca7oMRD-2FHeUC3wRGLMiDLzjmLCHa9LqmXt-2Fnqc19iE4w-3D-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYxuzuIS4-2BdCLUQWLoEaQFXmrQmbkSzcuuzBQKPxdIbhjmBPeXc9EEE7J7TnobJyEkt19pCtAsnfPguYCM-2FLJF-2BXQ-3D-3D>| Unsubscribe:\n> http://keepdream.me/unsub/4f77ed3860c258a567aeabf8<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRq4j3DzOkPdOTChpM0m11RZHXBAY7YaR21khrKmcun5l6qW8j0nnakPtIq4vt9ei4w-3D-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYx-2BjuW4ia8bNy94JLSVX8GxpqdcwxAtBvuN-2BhlK6T2cRkbl3yobgZP8ynj55ocplmSTTkgMhdTxhrw-3D-3D>\n>\n");
