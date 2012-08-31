var flatiron = require('flatiron')
  , sys = require('sys')
  , path = require('path')
  , ecstatic = require('ecstatic')
  , partial = require('partial')
  , redis = require('redis')
  , db = redis.createClient()
  , app = flatiron.app
  , connect = require('connect')
  , flow = require('flow')
  ;

app.config.file({ file: path.join(__dirname, 'config', 'config.json') });
app.use(flatiron.plugins.http);
app.http.before = [
  ecstatic(__dirname + '/public', { autoindex: false }),
  // some Connect modules require the "originalUrl" property which isn't normally set.
  function(req,res) { req.originalUrl = req.url; res.emit('next'); },
  connect.cookieParser(),
  connect.cookieSession({secret:'secret'}),
  checkLogin
  ];

function checkLogin(req,res) {
  var username = req.session.username;
  if(username === undefined && req.url !== '/login') {
    res.statusCode = 303;
    res.setHeader('Location', '/login');
    res.end();
    return false;
  }
  res.emit('next');
}

app.router.get('/login', function() {
  var res = this.res
    , req = this.req;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.write('<!doctype html>');
  res.write('<title>login</title>');
  res.write('<head>');
  res.write('<link rel="stylesheet" href="/style.css" />');
  res.write('</head>');
  res.write('<body>');
  res.write('<h1>login</h1>');
  res.write('<p>To begin, please identify yourself by entering your ONYEN name below.</p>');
  res.write('<form action="/login" method="post">');
  res.write('<input name="username" type="text" />');
  res.write('<input type="submit" />');
  res.write('</form>');
  res.end('</body>');
});

app.router.post('/login', function() {
  var res = this.res
    , req = this.req;
  var username = req.body.username.toLowerCase();
  if(username.length === 0) {
      res.statusCode = 303;
      res.setHeader('Location', '/login');
      res.end();
      return;
  }
  app.log.info('User '+username+' logged in from '+req.connection.remoteAddress);
  db.sadd('annotators', username);
  res.statusCode = 303;
  req.session.username = username;
  res.setHeader('Location', '/');
  res.end();
});

app.router.get('/', function () {
  var res = this.res
    , req = this.req;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.write('<!doctype html>');
  res.write('<title>interviews</title>');
  res.write('<head>');
  res.write('<link rel="stylesheet" href="/style.css" />');
  res.write('</head>');
  res.write('<body>');
  res.write('<h1>interviews</h1>');
  res.write('<p>Hello, ' + req.session.username + '. Select an interview to begin. Not ' + req.session.username + '? <a href="/login">Log in</a>.</p>');
  flow.exec(
    function() {
      res.write('<h2>unseen interviews</h2>');
      res.write('<ul>');
      db.sdiff('interviews', 'annotators:'+req.session.username+':seen', this);
    },function(err, interviews) {
      interviews.sort();
      interviews.forEach(function(interview, interview_index) {
        var id = interview.split(':')[1];
        res.write('<li><a href="/interview/' + id + '">' + id + '</a></li>');
      });
      res.write('</ul>');
      this();
    },
    function() {
      res.write('<h2>seen interviews</h2>');
      res.write('<ul>');
      db.smembers('annotators:'+req.session.username+':seen', this);
    },function(err, interviews) {
      interviews.sort();
      interviews.forEach(
        function(interview, interview_index) {
          var id = interview.split(':')[1];
          res.write('<li><a href="/interview/' + id + '">'
                    + id + '</a></li>');
        });
      res.write('</ul>');
      res.end('</body>');
    });
});

app.router.get('/interview/:id', function (interview_id) {
  var res = this.res
    , req = this.req
    , speaker = null
    , speechblock = null;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.write('<!doctype html>');
  res.write('<title>interview ' + interview_id + '</title>');
  res.write('<head>');
  res.write('<link rel="stylesheet" href="/style.css" />');
  res.write('<script src="/zepto.min.js"></script>');
  res.write('<script src="/function.js"></script>');
  res.write('</head>');
  res.write('<body>');
  db.sadd('annotators:'+req.session.username+':seen', 'interviews:'+interview_id);
  // TODO: write <hr>s for existing segments
  flow.exec(
    function() {
      db.lrange('interviews:' + interview_id + ':sentences', 0, -1, this);
    },function(err, sentences) {
      flow.serialForEach(sentences,
        function(sentence) {
          db.hgetall(sentence, partial(this,sentence));
        },function(sentence, err, o) {
          if (o.speechblock !== speechblock) {
            if (speechblock !== null) {
              res.write('</p>');
            }
            res.write('<p class="speechblock" id="' + speechblock + '">');
            if (o.speaker !== speaker) {
              res.write('<span class="speaker">' 
                + o.speaker.split('/')[1] + ':</span> ');
            }
            speaker = o.speaker;
            speechblock = o.speechblock;
          }
          res.write('<span class="sentence" id="' + sentence + '">'
            + o.text + '</span> ');
        },function() {
          res.end('</p></body>');
        });
    });
});

app.router.post('/insertSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var sentence_id = req.body.sentence_id;
  if(!username || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  app.log.info('User '+username+' inserted segment '+sentence_id);
  // TODO: insert to db
  res.statusCode = 200;
  res.end();
});

app.router.post('/deleteSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var sentence_id = req.body.sentence_id;
  if(!username || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  app.log.info('User '+username+' deleted segment '+sentence_id);
  // TODO: delete from db
  res.statusCode = 200;
  res.end();
});

app.start(app.config.get('port') || 8080, function (err) {
  if (err) { throw err }
  var addr = app.server.address();
  app.log.info('listening on http://' + addr.address + ':' + addr.port);
});

