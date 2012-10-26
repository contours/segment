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

Each annotator has a bcrypt-ed password. The annotator named "admin" is privileged.
```
SET "annotators:jsmith:password" "<hash goes here>"
SET "annotators:admin:password" "<hash goes here>"
```

A dataset is a set of interview IDs to be segmented. One dataset is "active".
```
SADD "datasets" "datasets:foo"
SADD "datasets:foo" "interviews:U-0098"
SET "active-dataset" "datasets:foo"
```

Each annotator has a set of interviews in each dataset that they've marked as done, and possibly a most recently viewed interview.
```
SADD "annotators:jsmith:datasets:foo:done" "interviews:U-0098"
SET "annotators:jsmith:datasets:foo:mru" "interviews:U-0098"
```

Each annotator's segmentation of an interview is represented by a set of sentence IDs, corresponding to the sentences immediately after each segment division. That is, each sentence ID in the set marks the beginning of a segment. Each segmentation is associated with one dataset.
```
SADD "annotators:jsmith:datasets:foo:interviews:U-0098" "sentences:280853"
```

Each segment may optionally be flagged as being an "excerpt". This does not change the structure of the segmentation.
```
SADD "annotators:jsmith:datasets:foo:interviews:U-0098:excerpts" "sentences:280853"
```

After a segmentation is marked as done, it's added to a number of indices.
```
SADD "segmentations" "annotators:jsmith:datasets:foo:interviews:U-0098"
SADD "annotators:jsmith:segmentations" "annotators:jsmith:datasets:foo:interviews:U-0098"
SADD "datasets:foo:segmentations" "annotators:jsmith:datasets:foo:interviews:U-0098"
SADD "interviews:U-0098:segmentations" "annotators:jsmith:datasets:foo:interviews:U-0098"
```

