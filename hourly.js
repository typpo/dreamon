//
// This script runs hourly and emails people as necessary
//

const { MongoClient } = require('mongodb');
const { zonedTimeToUtc, utcToZonedTime, format } = require('date-fns-tz');
const util = require('util');
const _ = require('underscore');
const nodemailer = require('nodemailer');
const tzdata = require('./tzdata.js');

const config = {
  APP_BASE_URL: 'http://keepdream.me/',
};

let closefn;
let connection = null;

// Figure out where it's between 3 and 4am right now

function timeToSend(t) {
  if (!t) return false;
  return t.getHours() === 3;
}

async function processTz(tzName) {
  try {
    const collection = connection.collection('people');
    const items = await collection.find({ tz: tzName }).toArray();

    for (const person of items) {
      console.log('Mailing', person.email, 'from', person.tz);

      const tmpl = `Good morning!

Respond to this email with last night's dreams and we'll record them for you..

Sincerely,
KeepDream (%s)

View past dreams: %s | Unsubscribe: %s`;

      const text = util.format(
        tmpl,
        config.APP_BASE_URL,
        config.APP_BASE_URL + 'view/' + person._id,
        config.APP_BASE_URL + 'unsub/' + person._id
      );

      let transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        secure: false,
        auth: {
          user: process.env['SENDGRID_USERNAME'],
          pass: process.env['SENDGRID_PASSWORD'],
        },
      });

      await transporter.sendMail({
        from: `"KeepDream" <${person._id}@keepdream.me>`,
        to: person.email,
        subject: 'Remember Your Dreams: respond when you wake up!',
        text: text,
      });
    }
  } catch (err) {
    console.error(err);
  } finally {
    closefn();
  }
}

(async () => {
  const url = process.env.MONGOLAB_URL || 'mongodb://localhost:27017';
  const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    connection = client.db('heroku_454v0pff');

    // check all the times
    let n = 0;
    for (const name of tzdata.names) {
      const t = utcToZonedTime(new Date(), name);

      if (timeToSend(t)) {
        console.log('Time to send in', name);
        processTz(name);
        n++;
      }
    }

    closefn = _.after(n, () => client.close());
  } catch (err) {
    console.error('Error:', err);
  }
})();
