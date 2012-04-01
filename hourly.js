//
// This script runs hourly and emails people as necessary
//

var mongo = require('mongodb')
  , time = require('time')
  , util = require('util')
  , tzdata = require('./tzdata.js')
  , config = require('./config.js')
  , SendGrid = require('sendgrid').SendGrid;

var connection = null;
var sendgrid = new SendGrid(config.sendgrid.user, config.sendgrid.key);

// Figure out where it's between 3 and 4am right now

function timeToSend(t) {
  if (!t) return false;
  return t.getHours() == 21;
}

function processTz(tzName) {
  connection.collection('dreams', function(err, collection) {
    if (err) return;
    collection.find({tz:tzName}, function(err, cursor) {
      if (err) return;
      cursor.toArray(function(err, items) {
        if (err) return;
        for (var i=0; i < items.length; i++) {
          var person = items[i];

          console.log('Mailing', person.email, 'from', person.tz);

          var tmpl = 'Good morning!\r\n\r\nRespond to this email with last night\'s dreams.\r\n\r\n'
            + 'View your past dreams: %s\r\n\r\n'
            + 'Unsubscribe: %s\r\n\r\n'
            + 'Sincerely,\r\nDreamOn\r\n%s';

          var text = util.format(tmpl,
            config.APP_BASE_URL + 'view/' + person._id,
            config.APP_BASE_URL + 'unsub/' + person._id,
            config.APP_BASE_URL);

          sendgrid.send({
              to: person.email,
              from: 'DreamOn <' + person._id + '@dreamon.herokuapp.com>',
              subject: 'Remember Your Dreams: respond when you wake up!',
              text: text
          }, function(success, obj) {
            if (!success) {
              console.log(obj)
            }
          });
        }
      });
    }); // end mongo find
  }); // end mongo collection
}
var url = require('url').parse(process.env.MONGOHQ_URL || "mongodb://127.0.0.1:27017");
var db = new mongo.Db('dreams', new mongo.Server(url.hostname, parseInt(url.port), {}));
db.open(function(err, conn) {
//mongo.connect(process.env.MONGOHQ_URL || "mongodb://localhost:27017", function(err, conn) {
  if (err) throw err;
  connection = conn;

  // check all the times
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
    }
  }
  db.close();
}); // end mongo connection

