/* vim: ts=2:sw=2 */
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
      if(err) throw err;
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
      if(err) throw err;
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
    , req = this.req;
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
  var last_speechblock = null
    , last_speaker = null;
  flow.exec(
    function() {
      db.lrange('interviews:' + interview_id + ':sentences', 0, -1, this);
    },function(err, sentences) {
      if(err) throw err;
      flow.serialForEach(sentences,
        // called for each sentence
        function(sentence_id) {
          db.hgetall(sentence_id, partial(this,sentence_id));
        // callback for each iteration
        },function(sentence_id, err, o) {
          if(err) throw err;
          if (o.speechblock !== last_speechblock) {
            if (last_speechblock !== null) {
              res.write('</p>');
            }
            res.write('<p class="speechblock" id="' + o.speechblock + '">');
            if (o.speaker !== last_speaker) {
              res.write('<span class="speaker">' 
                + o.speaker.split('/')[1] + ':</span> ');
            }
            last_speaker = o.speaker;
            last_speechblock = o.speechblock;
          }
          res.write('<span class="sentence" id="' + sentence_id + '">' + o.text + '</span> ');
        // called after all iterations are done
        }, this);
    },function() {
      res.write('</p>');
      db.smembers('annotators:'+req.session.username+':segmentation:'+interview_id, this);
    },function(err, sentences) {
      if(err) throw err;
      res.write('<script type="text/javascript">');
      res.write('Zepto(function($){');
      sentences.forEach(function(sentence_id) {
        res.write('insertSegment(document.getElementById("'+sentence_id+'"),true);');
      });
      res.write('});');
      res.write('</script>');
      res.end('</body>');
    });
});

app.router.post('/insertSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.sadd('annotators:'+username+':segmentation:'+interview_id, sentence_id);
  app.log.info('User '+username+' inserted segment '+sentence_id+' to interview '+interview_id);
  res.statusCode = 200;
  res.end();
});

app.router.post('/deleteSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.srem('annotators:'+username+':segmentation:'+interview_id, sentence_id);
  app.log.info('User '+username+' deleted segment '+sentence_id+' from interview '+interview_id);
  res.statusCode = 200;
  res.end();
});

app.start(app.config.get('port') || 8080, function (err) {
  if(err) throw err;
  var addr = app.server.address();
  app.log.info('listening on http://' + addr.address + ':' + addr.port);
});

