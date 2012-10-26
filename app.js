// vim: ts=2:sw=2
var flatiron = require('flatiron')
  , sys = require('sys')
  , path = require('path')
  , ecstatic = require('ecstatic')
  , partial = require('partial')
  , redis = require('redis')
  , connect = require('connect')
  , flow = require('flow')
  , bcrypt = require('bcrypt')
  , _ = require('underscore')
  , db = redis.createClient()
  , app = flatiron.app
  ;

// configuration
// ----
var INITIAL_ADMIN_PASSWORD = 'correct horse battery staple';
var BCRYPT_ROUNDS = 8;
// ----

// utilities
_.mixin({
  // {a: [1,2], b: [2,3]} -> {1: [a], 2: [a,b], 3: [b]}
  multimap_invert: function(m) {
    var w = {};
    _.uniq(_.flatten(_.values(m),true)).forEach(function(v) {
      w[v] = _.filter(_.keys(m), function(k) {
        return _.include(m[k], v);
      });
    });
    return w;
  },
  // only accepts two lists
  zipWith: function(fn, xs, ys) {
    return _.map(_.zip(xs,ys), function(xy){return fn(xy[0],xy[1]);});
  },
  // return new array with an element added to the head
  cons: function(x, xs) {
    var ys = xs.slice(0); // clone
    ys.unshift(x);
    return ys;
  },
  sub: function(a,b) { return a-b; }
});

app.config.file({ file: path.join(__dirname, 'config', 'config.json') });
app.use(flatiron.plugins.http);
app.http.before = [
  ecstatic(__dirname + '/public', { autoindex: false }),
  // some Connect modules expect the "originalUrl" property to be set
  function(req,res) { req.originalUrl = req.url; res.emit('next'); },
  connect.cookieParser(),
  connect.cookieSession({secret:'somerandomsecret82140'}),
  ensureLoggedIn
  ];

function ensureLoggedIn(req,res) {
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
  writeHeader(res,'login');
  writeLoginForm(res);
  res.end();
});

function writeHeader(res,title) {
  res.write('<!doctype html>');
  res.write('<title>'+title+'</title>');
  res.write('<head>');
  res.write('<link rel="stylesheet" href="/style.css" />');
  res.write('<script src="/zepto.min.js"></script>');
  res.write('<script src="/function.js"></script>');
  res.write('</head>');
  res.write('<body>');
}

function writeFooter(res) {
  res.write('</body>');
}

function writeLoginForm(res,err) {
  res.write('<h1>login</h1>');
  res.write('<p>To begin, please log in with your assigned username and password.</p>');
  res.write('<form action="/login" method="POST">');
  res.write('<p>Username: <input name="username" type="text" /></p>');
  res.write('<p>Password: <input name="password" type="password" /></p>');
  if(err) {
    res.write(err);
  }
  res.write('<input type="submit" />');
  res.write('</form>');
}

function tryLogin(req,res,callback) {
  var username = req.body.username.toLowerCase();
  if(username.length === 0) {
    return callback(false);
  }
  var passwordkey = 'annotators:'+username+':password';
  db.get(passwordkey, function(err,hash) {
    if(err) throw err;
    if(!hash) {
      app.log.info('Failed login attempt for user '+username+' from '+req.connection.remoteAddress);
      return callback(false);
    }
    bcrypt.compare(req.body.password, hash, function(err, ok) {
      if(err) throw err;
      if(ok) {
        app.log.info('User '+username+' logged in from '+req.connection.remoteAddress);
        req.session.username = username;
        return callback(true);
      } else {
        app.log.info('Failed login attempt for user '+username+' from '+req.connection.remoteAddress);
        return callback(false);
      }
    });
  });
}

app.router.post('/login', function() {
  var res = this.res
    , req = this.req;
  tryLogin(req,res,function(ok) {
    if(ok) {
      res.statusCode = 303;
      res.setHeader('Location', '/');
    } else {
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      writeHeader(res,'login');
      writeLoginForm(res,'<p style="color:red">Incorrect username or password.</p>');
    }
    writeFooter(res);
    res.end();
  });
});

app.router.get('/', function () {
  var res = this.res
    , req = this.req;
  if(req.session.username === 'admin') {
    res.statusCode = 303;
    res.setHeader('Location', '/admin');
    res.end();
    return;
  }
  var annotator_id = 'annotators:'+req.session.username;
  var active_dataset_id;
  var mru_interview_id;
  flow.exec(
  function() {
    db.get('active-dataset',this);
  },function(err,id) {
    if(err) throw err;
    active_dataset_id = id;
    db.get([annotator_id,active_dataset_id,'mru'].join(':'), this);
  },function(err,id) {
    if(err) throw err;
    mru_interview_id = id;
    // redirect to the most recently viewed interview, if it wasn't marked as done
    if(mru_interview_id) {
      db.sismember([annotator_id,active_dataset_id,'done'].join(':'), mru_interview_id, this);
    } else {
      this(undefined,true);
    }
  },function(err,mru_is_done_or_null) {
    if(err) throw err;
    if(!mru_is_done_or_null) {
      res.statusCode = 303;
      res.setHeader('Location', '/interview/'+mru_interview_id.split(':').slice(1).join(':'));
      res.end();
      return;
    }
    // otherwise a random interview that hasn't been marked as done, if one exists
    db.multi()
      .sdiffstore([annotator_id,active_dataset_id,'TMP-undone'].join(':'), active_dataset_id, [annotator_id,active_dataset_id,'done'].join(':'))
      .srandmember([annotator_id,active_dataset_id,'TMP-undone'].join(':'), this)
      .del([annotator_id,active_dataset_id,'TMP-undone'].join(':'))
      .exec();
  },function(err,id){
    if(err) throw err;
    // id is a random un-done interview id in the current dataset.
    if(id) {
      res.statusCode = 303;
      res.setHeader('Location', '/interview/'+id.split(':').slice(1).join(':'));
      res.end();
      return;
    }
    // otherwise say "Nothing left to annotate."
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    writeHeader(res,'done!');
    res.write('<p>Nothing left to annotate (in '+active_dataset_id+'). Thanks!</p>');
    writeFooter(res);
    res.end();
  });
});

app.router.get('/interview/:id', function (interview_name) {
  var res = this.res
    , req = this.req;
  var interview_id = 'interviews:'+interview_name;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  writeHeader(res,'interview '+interview_name);
  var last_speechblock = undefined
    , last_speaker = undefined;
  var active_dataset_id = undefined;
  var annotator_id = 'annotators:'+req.session.username;
  flow.exec(
  function() {
    db.get('active-dataset', this);
  },function(err,id) {
    if(err) throw err;
    active_dataset_id = id;
    db.set(annotator_id+':'+active_dataset_id+':mru', interview_id);
    db.lrange(interview_id + ':sentences', 0, -1, this);
  },function(err, sentences) {
    if(err) throw err;
    // print contents of every sentence, dividing them with <p>s based on the speechblock id changing
    flow.serialForEach(sentences,
      function(sentence_id) {
        db.hgetall(sentence_id, partial(this,sentence_id));
      },function(sentence_id, err, o) {
        if(err) throw err;
        if (o.speechblock !== last_speechblock) {
          if (last_speechblock !== undefined) {
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
      }, this);
  },function() {
    res.write('</p>');
    db.smembers(annotator_id+':'+active_dataset_id+':'+interview_id, this);
  },function(err, sentences) {
    if(err) throw err;
    // restore segment-marking <hr>s on page load
    res.write('<script type="text/javascript">');
    res.write('Zepto(function($){');
    sentences.forEach(function(sentence_id) {
      res.write('insertSegment(document.getElementById("'+sentence_id+'"),true);');
    });
    // restore excerpt markers
    db.smembers(annotator_id+':'+active_dataset_id+':'+interview_id+':excerpts', this);
  },function(err, excerpts) {
    if(err) throw err;
    excerpts.forEach(function(sentence_id) {
      res.write('toggleExcerpt(document.getElementById("'+sentence_id+':marker"),true);');
    });
    res.write('});');

    // set a kludgey global (see function.js)
    res.write('_DATASET_ID = \''+active_dataset_id+'\';');
    res.write('</script>');

    // "done" button
    res.write('<form action="/markDone" method="POST">');
    res.write('<input type="hidden" name="dataset_id" value="'+active_dataset_id+'"/>');
    res.write('<input type="hidden" name="interview_id" value="'+interview_id+'"/>');
    res.write('<p class="donebutton"><input type="submit" value="Mark as Done" /></p>');
    res.write('</form>');
    writeFooter(res);
    res.end();
  });
});

app.router.post('/insertSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var dataset_id = req.body.dataset_id;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.sadd('annotators:'+username+':'+dataset_id+':'+interview_id, sentence_id);
  app.log.info('User '+username+' inserted segment '+sentence_id+' to interview '+interview_id+' in data set '+dataset_id);
  res.statusCode = 200;
  res.end();
});

app.router.post('/deleteSegment', function () {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var dataset_id = req.body.dataset_id;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.srem('annotators:'+username+':'+dataset_id+':'+interview_id, sentence_id);
  app.log.info('User '+username+' deleted segment '+sentence_id+' from interview '+interview_id+' in data set '+dataset_id);
  res.statusCode = 200;
  res.end();
});

app.router.post('/setExcerpt', function() {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var dataset_id = req.body.dataset_id;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.sadd('annotators:'+username+':'+dataset_id+':'+interview_id+':excerpts', sentence_id);
  app.log.info('User '+username+' flagged segment '+sentence_id+' as an excerpt, in interview '+interview_id+' in data set '+dataset_id);
  res.statusCode = 200;
  res.end();
});

app.router.post('/unsetExcerpt', function() {
  var res = this.res
    , req = this.req;
  var username = req.session.username;
  var dataset_id = req.body.dataset_id;
  var interview_id = req.body.interview_id;
  var sentence_id = req.body.sentence_id;
  if(!username || !interview_id || !sentence_id) {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  db.srem('annotators:'+username+':'+dataset_id+':'+interview_id+':excerpts', sentence_id);
  app.log.info('User '+username+' unflagged segment '+sentence_id+' as an excerpt, in interview '+interview_id+' in data set '+dataset_id);
  res.statusCode = 200;
  res.end();
});

app.router.post('/markDone', function () {
  var res = this.res
    , req = this.req;
  var annotator_id = 'annotators:'+req.session.username;
  var segmentation_id = annotator_id+':'+req.body.dataset_id+':'+req.body.interview_id;
  db.sadd(annotator_id+':'+req.body.dataset_id+':done', req.body.interview_id, function(err) {
    if(err) throw err;
    db.sadd('segmentations', segmentation_id);
    db.sadd(req.body.interview_id+':segmentations', segmentation_id);
    db.sadd(annotator_id+':segmentations', segmentation_id);
    db.sadd(req.body.dataset_id+':segmentations', segmentation_id);
    res.statusCode = 303; // see other
    res.setHeader('Location', '/');
    res.end();
  });
});

function ensureAdmin(cb) {
  return function() {
    var res = this.res
      , req = this.req;
    if(req.session.username !== 'admin') {
      res.statusCode = 403;
      res.setHeader('Location', '/login');
      res.end();
    } else {
      cb(req,res);
    }
  }
}

app.router.get('/admin', ensureAdmin(function(req,res){
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  writeHeader(res,'admin');
  var x = {}; // various saved DB data between async calls (sorry)
  flow.exec(
  function(){
    res.write('<p>Hello, admin. <a href="/login">Back to login form</a>.</p>');
    res.write('<h1>Data Sets</h1>');
    db.get('active-dataset',this);
  },function(err,active_dataset_id) {
    if(err) throw err;
    x.active_dataset_id = active_dataset_id;
    if(x.active_dataset_id) {
      res.write('<p>Active dataset: '+x.active_dataset_id.split(':').slice(1).join(':')+'</p>');
    } else {
      res.write('<p>There is no active dataset.</p>');
    }

    res.write('<form action="/addDataset" method="POST">');
    res.write('<input type="text" name="name" value="name"/>');
    res.write('<input type="submit" value="New Dataset"/>');
    res.write('</form>');

    db.smembers('datasets',this);
  },function(err,datasets) {
    if(err) throw err;
    x.datasets = datasets;
    db.smembers('interviews',this);
  },function(err,interviews) {
    if(err) throw err;
    interviews.sort();
    var dataset_id = undefined;
    flow.serialForEach(x.datasets,
      function(id){
        dataset_id = id;
        db.smembers(dataset_id,this);
      },function(err,dataset_interviews){
        var dataset_name = dataset_id.split(':').slice(1).join(':');
        dataset_interviews.sort();
        res.write('<h2>&quot;'+dataset_name+'&quot;</h2>');
        res.write('<p>Contains '+dataset_interviews.length+' interviews.</p>');
        res.write('<p><a href="/dataset/'+dataset_name+'">Get segmentation data</a></p>');
        // TODO: completion statistics
        res.write('<form action="/addInterviewToDataset" method="POST">');
        res.write('<input type="hidden" name="dataset_id" value="'+dataset_id+'"/>');
        res.write('<select name="interview_id">');
        // interviews that are not in this dataset
        interviews.forEach(function(interview_id) {
          var interview_name = interview_id.split(':').slice(1).join(':');
          if(dataset_interviews.indexOf(interview_id) === -1) {
            res.write('<option value="'+interview_id+'">'+interview_name+'</option>');
          }
        });
        res.write('</select>');
        res.write('<input type="submit" value="Add Interview"/>');
        res.write('</form>');

        if(dataset_interviews.length > 0) {
          res.write('<form action="/removeInterviewFromDataset" method="POST">');
          res.write('<input type="hidden" name="dataset_id" value="'+dataset_id+'"/>');
          res.write('<select name="interview_id">');
          dataset_interviews.forEach(function(interview_id) {
            var interview_name = interview_id.split(':').slice(1).join(':');
            res.write('<option value="'+interview_id+'">'+interview_name+'</option>');
          });
          res.write('</select>');
          res.write('<input type="submit" value="Remove Interview"/>');
          res.write('</form>');
        }

        res.write('<form action="/setActiveDataset" method="POST">');
        res.write('<input type="hidden" name="dataset_id" value="'+dataset_id+'"/>');
        if(dataset_id !== x.active_dataset_id) {
          res.write('<input type="submit" value="Activate"/>');
        } else {
          res.write('<input type="submit" value="Activate" disabled="disabled"/>');
        }
        res.write('</form>');

        res.write('<form action="/deleteDataset" method="POST">');
        res.write('<input type="hidden" name="dataset_id" value="'+dataset_id+'"/>');
        res.write('<input type="submit" value="Delete"/>');
        res.write('</form>');
      }, this);
    x.interviews = interviews;
  },function(){
    res.write('<h1>Annotators</h1>');
    db.smembers('annotators',this);
  },function(err,annotators){
    if(err) throw err;
    res.write('<ul>');
    annotators.forEach(function(annotator_id){
      var annotator_name = annotator_id.split(':').slice(1).join(':');
      res.write('<li>');
      res.write(annotator_name);
      res.write('<form action="/deleteAnnotator" method="POST">');
      res.write('<input type="hidden" name="annotator_id" value="'+annotator_id+'"/>');
      res.write('<input type="submit" value="Delete"/>');
      res.write('</form>');
      // TODO: completion statistics
      res.write('</li>');
    });
    res.write('</ul>');

    res.write('<form action="/setPassword" method="POST">');
    res.write('<input type="text" name="username" value="username"/>');
    res.write('<input type="text" name="password" value="password"/>');
    res.write('<input type="submit" value="Set/Change Password"/>');
    res.write('</form>');

    res.write('<h1>Interviews</h1>');
    res.write('<ul>');
    x.interviews.forEach(function(interview_id){
      var id = interview_id.split(':').slice(1).join(':');
      res.write('<li><a href="/interview/'+id+'">'+id+'</a></li>');
    });
    res.write('</ul>');

    writeFooter(res);
    res.end();
  });
}));

app.router.post('/addDataset', ensureAdmin(function(req,res){
  db.sadd('datasets','datasets:'+req.body.name);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/deleteDataset', ensureAdmin(function(req,res){
  db.srem('datasets','datasets:'+req.body.name);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/addInterviewToDataset', ensureAdmin(function(req,res){
  db.sadd(req.body.dataset_id, req.body.interview_id);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/removeInterviewFromDataset', ensureAdmin(function(req,res){
  db.srem(req.body.dataset_id, req.body.interview_id);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/setActiveDataset', ensureAdmin(function(req,res){
  db.set('active-dataset', req.body.dataset_id);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/deleteAnnotator', ensureAdmin(function(req,res){
  db.del(req.body.annotator_id+':password');
  db.srem('annotators', req.body.annotator_id);
  res.statusCode = 303;
  res.setHeader('Location', '/admin');
  res.end();
}));

app.router.post('/setPassword', ensureAdmin(function(req,res){
  var target_annotator_id = 'annotators:'+req.body.username;
  bcrypt.hash(req.body.password, BCRYPT_ROUNDS, function(err, hash) {
    if(err) throw err;
    db.multi()
      .set(target_annotator_id+':password', hash)
      .sadd('annotators', target_annotator_id)
      .exec(function() {
        res.statusCode = 303;
        res.setHeader('Location', '/admin');
        res.end();
      });
  });
}));

// Constructs a segmentation object (for one interview) according to
// "Segmentation Representation Specification" (Fournier 2012).
function getSegmentation(dataset_id, interview_id, annotator_ids, callback) {
  var segs = {};
  flow.exec(
  function() {
    db.lrange(interview_id+':sentences',0,-1,this);
  },function(err,sentences) {
    if(err) throw err;
    flow.serialForEach(annotator_ids, function(annotator_id) {
      db.smembers(annotator_id+':'+dataset_id+':'+interview_id, partial(this,annotator_id));
    }, function(annotator_id, err) {
      if(err) throw err;
      var border_sentence_ids = _.rest(arguments,2);
      var indices = _.map(border_sentence_ids, function(id) {
        return sentences.indexOf(id);
      });
      indices.sort(_.sub); // ascending
      // transform segment indices to segment masses by subtracting each index from the one after it, starting with an extra 0 at the beginning.
      segs[annotator_id] = _.initial(_.zipWith(_.sub, indices, _.cons(0,indices)));
    }, function() {
      callback({
        "id": interview_id,
        "segmentation_type": "linear",
        "items": segs
      });
    });
  });
}

app.router.get('/dataset/:id', function(dataset_name) {
  var res = this.res
    , req = this.req;
  var dataset_id = 'datasets:'+dataset_name;
  res.statusCode = 200;
  res.setHeader('content-type', 'application/json');
  // annotator_interviews: which interviews in this data set each annotator has done
  var annotator_interviews = {};
  flow.exec(
  function() {
    db.smembers('annotators', this);
  },function(err,annotators) {
    if(err) throw err;
    flow.serialForEach(annotators, function(annotator_id) {
      db.sinter(dataset_id, annotator_id+':'+dataset_id+':done', partial(this,annotator_id));
    },function(annotator_id,err) {
      if(err) throw err;
      done = _.rest(arguments,2);
      if(done.length > 0) {
        annotator_interviews[annotator_id] = done;
      }
    }, this);
  },function() {
    var interview_annotators = _.multimap_invert(annotator_interviews);
    var segs = [];
    flow.serialForEach(_.keys(interview_annotators), function(interview_id) {
      getSegmentation(dataset_id, interview_id, interview_annotators[interview_id], this);
    },function(seg) {
      segs.push(seg);
    },function() {
      res.write(JSON.stringify({
        id: dataset_id,
        annotators: _.keys(annotator_interviews),
        interviews: segs
      }));
      res.end();
    });
  });
});

app.start(app.config.get('port') || 8080, function (err) {
  if(err) throw err;
  var addr = app.server.address();
  app.log.info('listening on http://' + addr.address + ':' + addr.port);
  // ensure that a default admin password exists
  db.exists('annotators:admin:password', function(err,exists) {
    if(err) throw err;
    if(!exists) {
      var p = INITIAL_ADMIN_PASSWORD;
      db.set('annotators:admin:password', bcrypt.hashSync(p, BCRYPT_ROUNDS));
      app.log.info('The administrator password has been initialized to: '+p);
    }
  });
});

