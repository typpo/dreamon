$(function() {
  var tz = jstz.determine_timezone().name();
  mixpanel.track('main');

  $('#submit').on('click', function() {
    var email = $('#email').val();
    if ($.trim(email) == '')
      return false;


    $.post('/signup', {'email': email,'tz': tz}, function(data) {
      mixpanel.track('signup');
      if (data.success) {
        var html = 'Thanks, ' + email + '! You\'ll start getting emails tomorrow morning.';
        if (data.msg) {
          html += '<br><br>' + data.msg;
        }
        $('#success-body').html(html);
        $('#success-modal').modal();
        $('#email').val('');
        mixpanel.track('signup success');
      }
      else {
        mixpanel.track('signup fail', {data: email});
        alert("Something went wrong and we couldn't add you, sorry :(\n\n" + data.msg);
      }
    }).error(function() {
      mixpanel.track('signup ajax fail', {data: email});
      alert("Something went wrong and we couldn't add you, sorry :(");
    });

    return false;
  });



  $('#submit-feedback').on('click', function() {
    $.post('/feedback', {'text': $('#feedback').val()}, function(data) {

    });
  });
});
