//
// This script runs hourly and emails people as necessary
//

var mongo = require('mongodb')
  , time = require('time')
  , util = require('util')
  , _ = require('underscore')
  , mailer = require('mailer')
  , tzdata = require('./tzdata.js')
  , config = require('./config.js')

var closefn;
var connection = null;

// Figure out where it's between 3 and 4am right now

function timeToSend(t) {
  if (!t) return false;
  return t.getHours() == 21;
}

function processTz(tzName) {
  connection.collection('people', function(err, collection) {
    if (err) { closefn(); return; };
    collection.find({tz:tzName}, function(err, cursor) {
      if (err) { closefn(); return; };
      cursor.toArray(function(err, items) {
        if (err) { closefn(); return; };
        for (var i=0; i < items.length; i++) {
          var person = items[i];

          console.log('Mailing', person.email, 'from', person.tz);

          var tmpl = 'Good morning!\r\n\r\nRespond to this email with last night\'s dreams and we\'ll record them for you..\r\n\r\n'
            + 'Sincerely,\r\nDreamOn (%s)\r\n\r\n'
            + 'View past dreams: %s | '
            + 'Unsubscribe: %s\r\n\r\n'

          var text = util.format(tmpl,
            config.APP_BASE_URL,
            config.APP_BASE_URL + 'view/' + person._id,
            config.APP_BASE_URL + 'unsub/' + person._id
          );

          mailer.send({
              host : "smtp.sendgrid.net",
              port : "587",
              domain : "keepdream.me",
              to : person.email,
              from : '"Dream On" <' + person._id + '@keepdream.me',
              subject: 'Remember Your Dreams: respond when you wake up!',
              body: text,
              authentication : "login",
              username : config.sendgrid.user,
              password : config.sendgrid.key,
            },
            function(err, result){
              if(err){
                console.log(err, result);
              }
          });
        }
        closefn();
      });
    }); // end mongo find
  }); // end mongo collection
}

var url = require('url').parse(process.env.MONGOHQ_URL || "mongodb://127.0.0.1:27017");
var db = new mongo.Db('keepdream', new mongo.Server(url.hostname, parseInt(url.port), {}));
db.open(function(err, conn) {
//mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
  if (err) throw err;
  connection = conn;

  // check all the times
  var n = 0;
  for(var i=0; i < tzdata.names.length; i++) {
    var name = tzdata.names[i];
    // get time for this offset
    var t = new time.Date();
    try {
      t.setTimezone(name);
    }
    catch(e) { continue; }

    if (timeToSend(t)) {
      // execute job for these places!
      console.log('Time to send in', name);
      processTz(name);
      n++;
    }
  }

  closefn = _.after(n, function close() { db.close(); });
}); // end mongo connection

