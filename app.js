var flatiron = require('flatiron')
  , path = require('path')
  , ecstatic = require('ecstatic')
  , redis = require('redis')
  , client = redis.createClient()
  , app = flatiron.app

app.config.file({ file: path.join(__dirname, 'config', 'config.json') })
app.use(flatiron.plugins.http)
app.http.before = [ ecstatic(__dirname + '/public', { autoindex: false }) ]

app.router.get('/', function () {
  var res = this.res
    , interview_id
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.write('<!doctype html>')
  res.write('<title>interviews</title>')
  res.write('<head>')
  res.write('<link rel=stylesheet href=/style.css>')
  res.write('</head>')
  res.write('<body>')
  res.write('<h1>interviews</h1>')
  res.write('<ul>')
  client.sort('interviews', 'alpha',
    function(err, interviews) {
      if (err) { throw err }
      interviews.forEach(
        function(interview, interview_index) {
          interview_id = interview.split(':')[1]
          res.write('<li><a href=/interview/' + interview_id + '>' 
                    + interview_id + '</a></li>')
        })
      res.end('</ul></body>')
    })
})

app.router.get('/interview/:id', function (interview_id) {
  var res = this.res
    , speaker = null
    , speechblock = null
  res.statusCode = 200
  res.setHeader('content-type', 'text/html; charset=utf-8')
  res.write('<!doctype html>')
  res.write('<title>interview ' + interview_id + '</title>')
  res.write('<head>')
  res.write('<link rel=stylesheet href=/style.css>')
  res.write('<script src=/zepto.min.js></script>')
  res.write('<script src=/function.js></script>')
  res.write('</head>')
  res.write('<body>')
  client.lrange('interviews:' + interview_id + ':sentences', 0, -1, 
    function(err, sentences) {
      if (err) { throw err }
      sentences.forEach(
        function(sentence, sentence_index) {
          client.hgetall(sentence,
            function(err, o) {
              if (err) { throw err }
              if (o.speechblock !== speechblock) {
                if (sentence_index > 0) {
                  res.write('</p>')
                }
                res.write('<p class=speechblock id=' + speechblock + '>')
                if (o.speaker !== speaker) {
                  res.write('<span class=speaker>' 
                    + o.speaker.split('/')[1] + ':</span> ')
                }
                speaker = o.speaker;
                speechblock = o.speechblock;
              }
              res.write('<span class=sentence id=' + sentence + '>' 
                + o.text + '</span> ')
              if (sentence_index === (sentences.length - 1)) {
                res.end('</p></body>')
              }
            })
        })
    })
})

app.start(app.config.get('port') || 8080, function (err) {
  if (err) { throw err }
  var addr = app.server.address()
  app.log.info('listening on http://' + addr.address + ':' + addr.port)
});
