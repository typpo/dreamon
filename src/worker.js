import { MongoClient, ObjectId } from 'mongodb';
import PostalMime from 'postal-mime';
import tzdata from '../tzdata.js';

const DEFAULT_DB_NAME = 'heroku_454v0pff';
const DEFAULT_BASE_URL = 'https://keepdream.me/';
const DEFAULT_FEEDBACK_TO = 'typppo@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    return handleRequest(request, env);
  },

  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(sendDueReminders(env));
  },

  async email(message, env) {
    await recordInboundEmail(message, env);
  },
};

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  try {
    if (request.method === 'HEAD' && pathname === '/') {
      return htmlResponse('');
    }

    if (request.method === 'GET' && pathname === '/') {
      return htmlResponse(renderIndex());
    }

    if (request.method === 'POST' && pathname === '/signup') {
      return await handleSignup(request, env);
    }

    if (request.method === 'POST' && pathname === '/feedback') {
      return await handleFeedback(request, env);
    }

    if (request.method === 'POST' && pathname === '/parse') {
      return await handleParsePost(request, env);
    }

    const viewMatch = pathname.match(/^\/view\/([^/]+)$/);
    if (request.method === 'GET' && viewMatch) {
      return await handleView(viewMatch[1], searchParams, env);
    }

    const downloadMatch = pathname.match(/^\/download\/([^/]+)$/);
    if (request.method === 'GET' && downloadMatch) {
      const dreams = await getDreams(downloadMatch[1], env);
      return htmlResponse(renderView(dreams));
    }

    const unsubMatch = pathname.match(/^\/unsub\/([^/]+)$/);
    if (request.method === 'GET' && unsubMatch) {
      return htmlResponse(`<h1><a href="/confirm_unsub/${escapeHtml(unsubMatch[1])}">Confirm Unsubscribe</a></h1>`);
    }

    const confirmUnsubMatch = pathname.match(/^\/confirm_unsub\/([^/]+)$/);
    if (request.method === 'GET' && confirmUnsubMatch) {
      return await handleConfirmUnsub(confirmUnsubMatch[1], env);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  } catch (err) {
    console.error('Request failed:', err);
    if (url.pathname === '/signup') {
      return jsonResponse({ success: false, msg: 'Could not save signup.' }, 500);
    }
    return new Response('Sorry, something went wrong.', { status: 500 });
  }
}

async function handleSignup(request, env) {
  const body = await readBody(request);
  const email = String(body.email || '').trim();
  const tz = validTimeZone(body.tz) ? body.tz : 'UTC';

  if (!EMAIL_RE.test(email)) {
    return jsonResponse({ success: false, msg: 'Invalid email.' });
  }

  await withDb(env, (db) =>
    db.collection('people').updateOne(
      { email },
      { $set: { email, tz, disabled: false }, $unset: { disabledAt: '', disabledReason: '' } },
      { upsert: true },
    )
  );

  return jsonResponse({ success: true });
}

async function handleFeedback(request, env) {
  const body = await readBody(request);
  const text = String(body.text || '');

  if (!env.EMAIL) {
    return new Response('', { status: 503 });
  }

  await env.EMAIL.send({
    from: { name: 'Feedback', email: `feedback@${emailDomain(env)}` },
    to: env.FEEDBACK_TO || DEFAULT_FEEDBACK_TO,
    subject: 'KeepDream feedback',
    text,
  });

  return new Response('');
}

async function handleParsePost(request, env) {
  const body = await readBody(request);
  const to = String(body.to || '');
  const from = String(body.from || '');
  const text = String(body.text || '');

  if (!to || !from || !text) {
    return new Response('', { status: 400 });
  }

  await recordDreamFromMessage({ to, from, text }, env);
  return new Response('');
}

async function handleView(id, searchParams, env) {
  if (searchParams.has('drop')) {
    return htmlResponse(
      `<a href="/view/${escapeHtml(id)}?reallydrop">Click here to delete your dream log. This is permanent.</a>`,
    );
  }

  if (searchParams.has('reallydrop')) {
    await withDb(env, (db) => db.collection('dreams').deleteMany({ unique: id }));
    return new Response('ok');
  }

  const dreams = await getDreams(id, env);
  if (searchParams.has('dl')) {
    return jsonResponse(dreams);
  }

  return htmlResponse(renderView(dreams));
}

async function handleConfirmUnsub(id, env) {
  if (!ObjectId.isValid(id)) {
    return htmlResponse(unsubError());
  }

  const result = await withDb(env, (db) =>
    db.collection('people').deleteOne({ _id: new ObjectId(id) })
  );
  return htmlResponse(result.deletedCount === 1 ? 'Successfully removed.' : unsubError());
}

async function getDreams(id, env) {
  return withDb(env, (db) =>
    db.collection('dreams').find({ unique: id }).sort({ time: -1 }).toArray()
  );
}

async function recordInboundEmail(message, env) {
  const parsed = await PostalMime.parse(message.raw);
  const to = message.to || firstAddress(parsed.to);
  const from = message.from || firstAddress(parsed.from);
  const text = parsed.text || htmlToText(parsed.html || '');

  if (!to || !from || !text) {
    message.setReject('Could not parse this message.');
    return;
  }

  await recordDreamFromMessage({ to, from, text }, env);
}

async function recordDreamFromMessage({ to, from, text }, env) {
  const id = recipientId(to);
  if (!id) {
    throw new Error(`Could not infer recipient id from ${to}`);
  }

  const dreamtext = extractDreamText(text, id, from);
  await withDb(env, (db) =>
    db.collection('dreams').insertOne({
      unique: id,
      text: dreamtext,
      time: Date.now(),
      raw: text,
    })
  );
}

async function sendDueReminders(env) {
  if (!env.EMAIL) {
    throw new Error('EMAIL binding is not configured.');
  }

  const zonesToSend = tzdata.names.filter((name) => timeToSend(name));
  if (zonesToSend.length === 0) {
    return;
  }

  const people = await withDb(env, (db) =>
    db.collection('people').find({
      tz: { $in: zonesToSend },
      disabled: { $ne: true },
    }).toArray()
  );

  for (const person of people) {
    await sendReminder(person, env);
  }
}

async function sendReminder(person, env) {
  const baseUrl = appBaseUrl(env);
  const id = String(person._id);
  const text = `Good morning!

Respond to this email with last night's dreams and we'll record them for you..

Sincerely,
KeepDream (${baseUrl})

View past dreams: ${baseUrl}view/${id} | Unsubscribe: ${baseUrl}unsub/${id}`;

  await env.EMAIL.send({
    from: { name: 'KeepDream', email: `${id}@${emailDomain(env)}` },
    to: person.email,
    subject: 'Remember Your Dreams: respond when you wake up!',
    text,
  });
}

async function withDb(env, fn) {
  if (!env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  const client = new MongoClient(env.MONGODB_URI, {
    appName: 'keepdream-worker',
    serverSelectionTimeoutMS: Number(env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 5000,
  });
  try {
    await client.connect();
    return await fn(client.db(env.MONGODB_DB || DEFAULT_DB_NAME));
  } finally {
    await client.close();
  }
}

async function readBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return request.json();
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    return Object.fromEntries(await request.formData());
  }

  return Object.fromEntries(new URLSearchParams(await request.text()));
}

function timeToSend(tzName) {
  try {
    const hour = new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      hourCycle: 'h23',
      timeZone: tzName,
    })
      .formatToParts(new Date())
      .find((part) => part.type === 'hour')?.value;
    return Number(hour) === 3;
  } catch {
    return false;
  }
}

function validTimeZone(tzName) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(tzName || '') });
    return true;
  } catch {
    return false;
  }
}

function recipientId(to) {
  const address = firstAddress(to);
  const match = address.match(/([^<\s@]+)@/);
  return match ? match[1] : '';
}

function firstAddress(value) {
  if (!value) {
    return '';
  }
  if (Array.isArray(value)) {
    return firstAddress(value[0]);
  }
  if (typeof value === 'object') {
    return value.address || value.email || '';
  }
  return String(value);
}

function extractDreamText(text, id, from) {
  const lines = String(text).split('\n');
  const includeLines = [];

  for (const line of lines) {
    if (
      line.includes(id) ||
      line.includes(from) ||
      line.includes('KeepDream') ||
      /^On .+wrote:$/i.test(line.trim())
    ) {
      break;
    }
    includeLines.push(line);
  }

  return includeLines.join('\n').trim();
}

function appBaseUrl(env) {
  const url = env.APP_BASE_URL || DEFAULT_BASE_URL;
  return url.endsWith('/') ? url : `${url}/`;
}

function emailDomain(env) {
  if (env.EMAIL_DOMAIN) {
    return env.EMAIL_DOMAIN;
  }
  return new URL(appBaseUrl(env)).hostname;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

function renderIndex() {
  return renderLayout(`
    <div class="container">
      <div class="page">
        <div class="logo logomain"><span>KeepDream</span></div>
        <div style="float:right;margin-right:15px;margin-top:30px;">
          <span><a href="#" onClick="$('#about-modal').modal();return false;">About</a></span> |
          <span><a href="#" onClick="$('#feedback-modal').modal();return false;">Feedback</a></span>
        </div>
        <div class="row" style="padding-top:30px;padding-left:15px;">
          <div class="span10">
            <p style="font-size:35px; font-weight:bold;line-height:1.2em">The easiest way to remember dreams.</p>
            <div style="margin-left:5px;margin-top:15px;margin-bottom:15px;margin-left:25px;">
              <img src="/images/bedphone.png" style="float:right">
              <ol>
                <li><span>You wake up to an email asking what you dreamed.</span></li>
                <li><span>We build a private log of your responses.</span></li>
                <li><span>Research shows that recording dreams daily leads to memorable, vivid dreams.</span></li>
              </ol>
            </div>
          </div>
          <div class="span4" style="padding-right:0;margin-right:0;margin-left:79px">
            <form class="form-horizontal">
              <input id="email" class="input-large" placeholder="you@gmail.com">
              <input id="submit" class="btn btn-primary btn-large" type="submit" value="Sign up">
              <br>
              <span>Thousands of dreams recorded since 2012.</span>
              <p style="font-size:9px">(one email per day, one-click unsubscribe, export or delete your data anytime)</p>
            </form>
          </div>
        </div>
        <div class="row" style="padding-bottom:10px;margin-top:15px">
          <div class="span6">
            <div style="margin-left:50px;margin-right:0">
              <h2>You forget most of your dreams...</h2>
              <p style="font-size:14px"><strong>You dream every night</strong> but most people only remember small segments. Habitually recording dreams makes them <strong>more vivid</strong> and <strong>easier to remember</strong>.</p>
            </div>
          </div>
          <div class="span6">
            <div style="margin-right:50px">
              <h2>That can change.</h2>
              <p style="font-size:14px">Dreams can be committed to long term memory by recording them when they're still <strong>fresh in your mind</strong>. Even jotting down a few key words makes a big difference.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="success-modal" class="modal" style="display:none;">
      <div class="modal-header"><a class="close" data-dismiss="modal">&times;</a><h2>Success</h2></div>
      <div class="modal-body"><p id="success-body"></p></div>
      <div class="modal-footer"><a class="btn btn-primary" data-dismiss="modal">Close</a></div>
    </div>
    <div id="about-modal" class="modal" style="display:none;">
      <div class="modal-header"><a class="close" data-dismiss="modal">&times;</a><h2>About</h2></div>
      <div class="modal-body"><p>KeepDream was created by <a href="http://www.ianww.com/">Ian Webster</a>, a software engineer in Mountain View. Since its start in 2012, users have recorded thousands of dreams.</p></div>
      <div class="modal-footer"><a class="btn btn-primary" data-dismiss="modal">Close</a></div>
    </div>
    <div id="feedback-modal" class="modal" style="display:none;">
      <div class="modal-header"><a class="close" data-dismiss="modal">&times;</a><h2>Feedback</h2></div>
      <div class="modal-body"><p><textarea id="feedback" class="xlarge" rows="5" cols="80" style="width:500px"></textarea></p></div>
      <div class="modal-footer">
        <a id="submit-feedback" class="btn btn-primary" data-dismiss="modal">Submit</a>
        <a class="btn" data-dismiss="modal">Close</a>
      </div>
    </div>
  `);
}

function renderView(dreams) {
  const rows = dreams.map((dream) => {
    const date = new Date(dream.time);
    const heading = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
    const parts = String(dream.text || '')
      .split('\n\n')
      .map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
      .join('');

    return `
      <div class="row">
        <div class="span8">
          <h2>${escapeHtml(heading)}</h2>
          ${parts}
        </div>
      </div>
    `;
  }).join('');

  return renderLayout(`
    <div class="navbar navbar-fixed-top">
      <div class="navbar-inner">
        <div class="container">
          <a class="brand"></a>
          <div class="nav-collapse">
            <ul class="nav"><li class="active"><a href="/">Home</a></li></ul>
          </div>
        </div>
      </div>
    </div>
    <div class="container">
      <div class="dreamview page">
        <div style="float:right">Log actions: <a href="?dl">Export</a>, <a href="?drop">Delete</a></div>
        ${rows}
      </div>
    </div>
    <script>mixpanel.track('view');</script>
  `);
}

function renderLayout(content) {
  return `<!DOCTYPE html>
<html>
<head>
  <title>Remember Your Dreams - Online Dream Journal and Reminders</title>
  <link rel="stylesheet" href="/css/bs-r.css">
  <link rel="stylesheet" href="/css/style.css">
  <script>window.mixpanel=window.mixpanel||{track:function(){},init:function(){}};</script>
  <script src="https://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js"></script>
  <script src="/js/jstz.min.js"></script>
  <script src="/js/main.js"></script>
  <script src="/js/bs.js"></script>
  <link href="https://fonts.googleapis.com/css?family=Bad+Script" rel="stylesheet" type="text/css">
</head>
<body>${content}</body>
</html>`;
}

function unsubError() {
  return 'Sorry, something went wrong. Please email iwmiscs@gmail.com to unsubscribe :(.';
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
