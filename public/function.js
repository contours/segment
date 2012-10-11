// vim: ts=2:sw=2

// beep beep, encapsulation violation
var interview_id = 'interviews:'+document.URL.split('/').pop();
// _DATASET_ID is a global set by some JS emitted elsewhere on the page.
var segments = {}; // set of sentence ids that have been marked

function insertSegment(span,dontPost) {
  var sentence = $(span);
  var sentence_id = sentence.attr('id');
  var hr = '<hr class="segment" sentence_id="'+sentence_id+'"/>';
  segments[sentence_id] = true;
  // When this is the first sentence in a speechblock, put the <hr> before the speaker's name so it looks nicer.
  if(sentence.prev().hasClass('speaker')) {
    sentence.prev().before(hr);
  } else {
    sentence.before(hr);
  }
  updateMarkers();

  if(!dontPost) {
    $.post('/insertSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  }
}

function deleteSegment(span) {
  var sentence_id = $(span).attr('sentence_id');
  delete segments[sentence_id];
  $(span).remove();
  $.post('/deleteSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  updateMarkers();
}

function updateMarkers() {
  var inside = false;
  var marker = null;
  var prev_bottom = 0;
  var marker_top = 0;
  $('.marker').remove();
  $('span.sentence').each(function() {
    if($(this).attr('id') in segments) {
      inside = !inside;

      if(inside) {
        // start a new marker
        var o = $(this).offset();
        marker = $('<div class="marker"/>');
        marker.css('top', o.top);
        marker.css('left', o.left - 15);
        marker_top = o.top;
      } else {
        // end the previous marker
        marker.css('height', prev_bottom - marker_top);
        marker.appendTo(document.body);
      }
    }
    prev_bottom = $(this).offset().top + $(this).offset().height;
  });
}

Zepto(function($) {
  // TODO: also make speaker names clickable.
  $('body')
    .on('click', 'span.sentence', function(e){insertSegment(e.target)})
    .on('click', 'hr', function(e){deleteSegment(e.target)})
  updateMarkers();
});

