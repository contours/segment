function insertSegment(e) {
  $(e.target).after('<hr class="segment"/>');
  // TODO: ajax request to insert segment
}

function deleteSegment(e) {
  $(e.target).remove();
  // TODO: ajax request to remove segment
}

Zepto(function($) {
  $('body')
    .on('click', 'span.sentence', insertSegment)
    .on('click', 'hr', deleteSegment)
});

