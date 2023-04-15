const express = require('express')
  , app = express()
  , _ = require('underscore')
  , validator = require('validator')
  , nodemailer = require('nodemailer')
  , { MongoClient } = require('mongodb');

// Express config
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname + '/public'));

// MongoDB connection
const url = process.env.MONGOLAB_URL || "mongodb://localhost:27017";
const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });
const dbName = 'heroku_454v0pff';
let db;

(async function() {
  try {
    await client.connect();
    db = client.db(dbName);
  } catch (err) {
    console.error('Error:', err);
  }
})();

// App

/* Homepage */
app.get('/', function(req, res) {
  res.render('index', { });
});

/* New signup */
app.post('/signup', async function(req, res) {
  const email = req.body.email;
  const tz = req.body.tz;

  // check email
  if (!validator.isEmail(email)) {
    res.send({success: false, msg: 'Invalid email.'});
    return;
  }

  // send to mongo
  try {
    const collection = db.collection('people');
    await collection.updateOne(
      { email: email },
      { $set: { email: email, tz: tz } },
      { upsert: true }
    );

    console.log('Update successful');
  } catch (err) {
    console.error('Error:', err);
  }
});

/* View dreams */
app.get('/view/:id', async function (req, res) {
  const collection = db.collection('dreams');
  const id = req.params.id;
  const query = { unique: id };

  const items = await findItems(collection, query);
  handleViewResponse(req, res, items);
});

/* Download dreams */
app.get('/download/:id', async function (req, res) {
  const collection = db.collection('dreams');
  const id = req.params.id;
  const query = { unique: id };

  const items = await findItems(collection, query);
  res.render('view', { dreams: items });
});

async function findItems(collection, query) {
  try {
    const cursor = await collection.find(query);
    return await cursor.sort({ time: -1 }).toArray();
  } catch (err) {
    console.error('Error:', err);
    return [];
  }
}

function handleViewResponse(req, res, items) {
  if ('dl' in req.query) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(items));
  } else if ('drop' in req.query) {
    res.send(
      '<a href="/view/' + req.params.id + '?reallydrop">Click here to delete your dream log.  This is permanent.</a>'
    );
  } else if ('reallydrop' in req.query) {
    const collection = db.collection('dreams');
    collection.deleteOne({ unique: req.params.id });
    res.send('ok');
  } else {
    res.render('view', {
      dreams: items,
    });
  }
}

/* Unsubscribe */
app.get('/unsub/:id', function(req, res) {
  res.send('<h1><a href="/confirm_unsub/' + req.params.id + '">Confirm Unsubscribe</a></h1>');
});

app.get('/confirm_unsub/:id', async function(req, res) {
  try {
    const url = process.env.MONGOLAB_URL || "mongodb://localhost:27017";
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });

    await client.connect();

    const dbName = 'heroku_454v0pff';
    const db = client.db(dbName);
    const collection = db.collection('people');

    const result = await collection.deleteOne({ _id: new mongo.ObjectID(req.params.id) });

    if (result.deletedCount === 1) {
      res.send('Successfully removed.');
    } else {
      res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
    }
  } catch (err) {
    res.send('Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.');
  } finally {
    client.close();
  }
});

/* Feedback */
app.post('/feedback', async function(req, res) {
  var text = req.body.text;

  let transporter = nodemailer.createTransport({
    host: "smtp.sendgrid.net",
    port: 587,
    secure: false,
    auth: {
      user: process.env['SENDGRID_USERNAME'],
      pass: process.env['SENDGRID_PASSWORD']
    }
  });

  let info = await transporter.sendMail({
    from: '"Feedback" feedback@keepdream.me',
    to: 'typppo@gmail.com',
    subject: 'KeepDream feedback',
    text: text
  });

  console.log('Message sent:', info.messageId);
  res.send('');
});

/* Received an email */
app.post('/parse', async function(req, res) {
  var to = req.body.to;
  var from = req.body.from;
  var text = req.body.text;

  await gotemail(to, from, text);
  res.send('');
});

async function gotemail(to, from, text) {
  console.log('Got email to', to, 'from', from);
  // send to mongo
  const startidx = Math.max(to.indexOf('<') + 1, 0);
  const id = to.slice(startidx, to.indexOf('@'));

  // cut off text so we don't record original email
  const lines = text.split('\n');
  const includelines = [];

  for (const line of lines) {
    if (line.indexOf(id) > -1 || line.indexOf(from) > -1 || line.indexOf('KeepDream') > -1) {
      break;
    }
    includelines.push(line);
  }

  const dreamtext = includelines.join('\n');

  try {
    const url = process.env.MONGOLAB_URL || "mongodb://localhost:27017";
    const client = new MongoClient(url, { useNewUrlParser: true, useUnifiedTopology: true });

    await client.connect();

    const dbName = 'heroku_454v0pff';
    const db = client.db(dbName);
    const collection = db.collection('dreams');

    await collection.insertOne({
      unique: id,
      text: dreamtext,
      time: new Date().getTime(),
      raw: text,
    });

    console.log('Recorded dream', id);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.close();
  }
}

var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log('Listening on', port);
});

//gotemail('testing@keepdream.me', 'testing@keepdream.me', "another fucking test\n\nOn Sun, Apr 1, 2012 at 3:32 AM, Dream On <\ntesting@keepdream.me> wrote:\n\n> Good morning!\n>\n> Respond to this email with last night's dreams and we'll record them for\n> you..\n>\n> Sincerely, DreamOn (http://keepdream.me/<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRu5tmj1qOBjfYJS4azSHcWg-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYxV6ojB1fpdS5LsOm1jU8GOO7r-2BrPmJQ2ws178X9maCIaJaYY1G5HVQBhwx-2BAmFRAdB8keFkYHCuQ-2BqStlEnC1BA-3D-3D>\n> )\n>\n> View past dreams: http://keepdream.me/view/4f77ed3860c258a567aeabf8<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRru5Yfa-2FZdfrkTI2NHJQcbca7oMRD-2FHeUC3wRGLMiDLzjmLCHa9LqmXt-2Fnqc19iE4w-3D-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYxuzuIS4-2BdCLUQWLoEaQFXmrQmbkSzcuuzBQKPxdIbhjmBPeXc9EEE7J7TnobJyEkt19pCtAsnfPguYCM-2FLJF-2BXQ-3D-3D>| Unsubscribe:\n> http://keepdream.me/unsub/4f77ed3860c258a567aeabf8<http://sendgrid.me/wf/click?upn=AOmug9hCKjQuzHKl3XnuRq4j3DzOkPdOTChpM0m11RZHXBAY7YaR21khrKmcun5l6qW8j0nnakPtIq4vt9ei4w-3D-3D_KBjE5m2On0IpDgCIYtH3RScXLla6hTkfw1BythzQ8nqnc84aGuwrHOfHSkdZHZYx-2BjuW4ia8bNy94JLSVX8GxpqdcwxAtBvuN-2BhlK6T2cRkbl3yobgZP8ynj55ocplmSTTkgMhdTxhrw-3D-3D>\n>\n");
