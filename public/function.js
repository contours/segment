// vim: ts=2:sw=2

// beep beep, encapsulation violation
var interview_id = 'interviews:'+document.URL.split('/').pop();
// _DATASET_ID is a global set by some JS emitted elsewhere on the page.
var segments = {}; // set of sentence ids that are segments
var excerpts = {}; // set of sentence ids that are excerpts

function insertSegment(span,dontPost) {
  var sentence = $(span);
  var sentence_id = sentence.attr('id');
  if(segments[sentence_id]) {
    return;
  }

  var hr = '<hr class="segment" sentence_id="'+sentence_id+'"/>';
  segments[sentence_id] = true;
  // When this is the first sentence in a speechblock, put the <hr> before the speaker's name so it looks nicer.
  if(sentence.prev().hasClass('speaker')) {
    sentence.prev().before(hr);
  } else {
    sentence.before(hr);
  }
  drawMarkers();

  if(!dontPost) {
    $.post('/insertSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  }
}

function deleteSegment(span) {
  var sentence_id = $(span).attr('sentence_id');
  delete segments[sentence_id];
  $(span).remove();
  $.post('/deleteSegment', { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  drawMarkers();
}

function toggleExcerpt(marker,dontPost) {
  var sentence_id = $(marker).attr('sentence_id');
  var was_excerpt;
  if($(marker).hasClass('excerptmarker')) {
    was_excerpt = true;
    $(marker).addClass('emptymarker');
    $(marker).removeClass('excerptmarker');
    excerpts[sentence_id] = false;
  } else {
    was_excerpt = false;
    $(marker).addClass('excerptmarker');
    $(marker).removeClass('emptymarker');
    excerpts[sentence_id] = true;
  }

  if(!dontPost) {
    var url;
    if(was_excerpt) {
      url = '/unsetExcerpt';
    } else {
      url = '/setExcerpt';
    } 
    $.post(url, { dataset_id: _DATASET_ID, interview_id: interview_id, sentence_id: sentence_id });
  }
}

function drawMarkers() {
  var marker = null;
  var prev_bottom = 0;
  var marker_top = 0;
  $('.marker').remove();
  $('span.sentence').each(function() {
    var sentence_id = $(this).attr('id');
    if(sentence_id in segments) {
      if(marker) {
        // end the previous marker
        marker.css('height', prev_bottom - marker_top);
        marker.appendTo(document.body);
      }
      // start a new marker
      var o = $(this).offset();
      marker = $('<div class="marker" />');
      marker.attr('id', sentence_id+':marker');
      marker.attr('sentence_id', sentence_id);
      if(excerpts[sentence_id]) {
        marker.addClass('excerptmarker');
      } else {
        marker.addClass('emptymarker');
      }
      marker.css('top', o.top);
      marker.css('left', o.left - 15);
      marker_top = o.top;
    }
    prev_bottom = $(this).offset().top + $(this).offset().height;
  });
  // TODO: end marker at end of document?
}

Zepto(function($) {
  // TODO: also make speaker names clickable.
  $('body')
    .on('click', 'span.sentence', function(e){insertSegment(e.target)})
    .on('click', 'hr', function(e){deleteSegment(e.target)})
    .on('click', '.marker', function(e){toggleExcerpt(e.target)})
  drawMarkers();
});

