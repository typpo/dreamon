$(function() {
  var tz = jstz.determine_timezone().name();

  $('#submit').on('click', function() {
    var email = $('#email').val();
    if ($.trim(email) == '')
      return false;


    $.post('/signup', {'email': email,'tz': tz}, function(data) {
      if (data.success) {
        var html = 'Thanks, ' + email + '! You\'ll start getting emails tomorrow morning.';
        if (data.msg) {
          html += '<br><br>' + data.msg;
        }
        $('#success-body').html(html);
        $('#success-modal').modal();
        $('#email').val('');
      }
      else {
        alert("Something went wrong and we couldn't add you, sorry :(\n\n" + data.msg);
      }
    }).error(function() {
      alert("Something went wrong and we couldn't add you, sorry :(");
    });

    return false;
  });



  $('#submit-feedback').on('click', function() {
    $.post('/feedback', {'text': $('#feedback').val()}, function(data) {

    });
  });
});
