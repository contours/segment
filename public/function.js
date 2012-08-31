function insertSegment(e) {
  // TODO: also make speaker names clickable.
  var sentence = $(e.target);
  var id = sentence.attr('id');
  var hr = '<hr class="segment" sentence_id="'+id+'"/>';
  if(sentence.prev().hasClass('speaker')) {
    sentence.prev().before(hr);
  } else {
    sentence.before(hr);
  }
  $.post('/insertSegment', { sentence_id: id });
}

function deleteSegment(e) {
  var id = $(e.target).attr('sentence_id');
  $(e.target).remove();
  $.post('/deleteSegment', { sentence_id: id });
}

Zepto(function($) {
  $('body')
    .on('click', 'span.sentence', insertSegment)
    .on('click', 'hr', deleteSegment)
});

