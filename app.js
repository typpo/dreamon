var express = require('express')
  , app = express.createServer()
  , mongo = require('mongodb')
  , ObjectID = require('mongodb').ObjectID
  , connect = require('connect')

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


var port = process.env.PORT || 8080;
app.listen(port, function() {
  console.log('Listening on', port);

});
