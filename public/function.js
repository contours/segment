// vim: ts=2:sw=2

// beep beep, encapsulation violation
var interview_id = 'interviews:'+document.URL.split('/').pop();
// _DATASET_ID is a global set by some JS emitted elsewhere on the page.

function insertSegment(span,dontPost) {
  var sentence = $(span);
  var sentence_id = sentence.attr('id');
  var hr = '<hr class="segment" sentence_id="'+sentence_id+'"/>';
  // When this is the first sentence in a speechblock, put the <hr> before the speaker's name so it looks nicer.
  if(sentence.prev().hasClass('speaker')) {
    sentence.prev().before(hr);
  } else {
    sentence.before(hr);
  }
  if(!dontPost) {
    $.post('/insertSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  }
}

function deleteSegment(span) {
  var sentence_id = $(span).attr('sentence_id');
  $(span).remove();
  $.post('/deleteSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
}

Zepto(function($) {
  // TODO: also make speaker names clickable.
  $('body')
    .on('click', 'span.sentence', function(e){insertSegment(e.target)})
    .on('click', 'hr', function(e){deleteSegment(e.target)})
});

