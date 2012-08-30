segment
=======

This is a simple webapp for manually segmenting oral history transcripts.

The easiest way to install dependencies is to use
[npm](https://npmjs.org/). Just `cd` to the project directory and `npm
install`.

To start the app, `npm start` or `node app.js`.

redis database structure
------------------------

There is a [set](http://redis.io/commands/#set) of interview IDs.
```
SADD "interviews" "interviews:U-0098"
```

The sentences of each interview are stored as a
[list](http://redis.io/commands/#list) of sentence IDs.
```
RPUSH "interviews:U-0098:sentences" "sentences:280853"
```

Interviews are divided into "speechblocks" (equivalent to
paragraphs). The speechblocks of each interview are stored as a list
of speechblock IDs.
```
RPUSH "interviews:U-0098:speechblocks" "speechblocks:U-0098/37"
```

The sentences of each speechblock are stored as list of sentence IDs.
```
RPUSH "speechblocks:U-0098/37:sentences" "sentences:280853"
```

The speakers of each interview are stored as a set of speaker IDs.
```
SADD "interviews:U-0098:speakers" "speakers:U-0098/TAWANA BELINDA WILSON-ALLEN"
```

The sentences of each speaker are stored as a list of sentence IDs.
```
RPUSH "speakers:U-0098/TAWANA BELINDA WILSON-ALLEN:sentences" "sentences:280853"
```

The speechblocks of each speaker are stored as a list of speechblock IDs.
```
RPUSH "speakers:U-0098/TAWANA BELINDA WILSON-ALLEN:speechblocks" "speechblocks:U-0098/37"
```

Each sentence is stored as a [hash](http://redis.io/commands/#hash).
```
HMSET "sentences:280853"
  "text" "Yeah."
  "index" "0"
  "speechblock" "speechblocks:U-0098/37"
  "speaker" "speakers:U-0098/TAWANA BELINDA WILSON-ALLEN"
  "interview" "interviews:U-0098"
```

There is a set of annotator IDs.
```
SADD "annotators" "annotators:jsmith"
```

Each annotator has a set of seen interviews.
```
SADD "annotators:jsmith:seen" "interviews:U-0098"
```

Each annotator's segmentation of an interview is represented by a set of sentence IDs, corresponding to the sentences immediately after each segment division.
```
SADD "annotators:jsmith:segmentation:U-0098" "sentences:280853"
```





