
// beep beep, encapsulation violation
var interview_id = document.URL.split('/').pop();

function insertSegment(span,dontPost) {
  var sentence = $(span);
  var id = sentence.attr('id');
  var hr = '<hr class="segment" sentence_id="'+id+'"/>';
  // When this is the first sentence in a speechblock, put the <hr> before the speaker's name so it looks nicer.
  if(sentence.prev().hasClass('speaker')) {
    sentence.prev().before(hr);
  } else {
    sentence.before(hr);
  }
  if(!dontPost) {
    $.post('/insertSegment', { interview_id: interview_id, sentence_id: id });
  }
}

function deleteSegment(span) {
  var id = $(span).attr('sentence_id');
  $(span).remove();
  $.post('/deleteSegment', { interview_id: interview_id, sentence_id: id });
}

Zepto(function($) {
  // TODO: also make speaker names clickable.
  $('body')
    .on('click', 'span.sentence', function(e){insertSegment(e.target)})
    .on('click', 'hr', function(e){deleteSegment(e.target)})
});

