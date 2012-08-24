function insertSegment(e) {
  var $target = $(e.target)
    , $following = $()
    , hr = '<hr data-tooltip="click to remove">'
    , $p
    , $nextp
    , $next
  $p = $target.parent()
  $nextp = $p.next()
  for ($next = $target.next(); $next.length > 0; $next = $next.next())
    $following.push($next[0])
  if ($following.length > 0)
    $('<p>').append($following).insertAfter($p).before(hr)
  else if ($nextp.length > 0 && $nextp[0].nodeName.toLowerCase() !== 'hr')
    $p.after(hr)
}

function deleteSegment(e) {
  var $target = $(e.target)
  if (! $target.next().attr('id'))
    $target.prev().append($target.next().children())
  $target.remove()  
}

Zepto(function($) {
  $('body')
    .on('click', 'span.sentence', insertSegment)
    .on('click', 'hr', deleteSegment)
})