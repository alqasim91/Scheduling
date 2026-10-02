/**
 * Inline script for exported pages: marks the cards that are happening now.
 *
 * Plain ES5 on purpose (it ships inside a standalone file and must run in old browsers).
 * It reads the event date and timezone from the embedded `#schedule-data` JSON, gets today's
 * date and the minute of the day in that timezone, and, on the event day, adds `now` to every
 * `.ev[data-s]` card or table `tr[data-s]` row (not `.ghost`) with start <= now < end. It repeats every 60 seconds and never throws.
 */
export const NOW_SCRIPT = `(function () {
  function tick() {
    try {
      var data = JSON.parse(document.getElementById('schedule-data').textContent);
      var event = data.event;
      var parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: event.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(new Date());
      var o = {};
      for (var i = 0; i < parts.length; i++) o[parts[i].type] = parts[i].value;
      var today = o.year + '-' + o.month + '-' + o.day;
      var minutes = (parseInt(o.hour, 10) % 24) * 60 + parseInt(o.minute, 10);
      var cards = document.querySelectorAll('.ev[data-s], tr[data-s]');
      for (var j = 0; j < cards.length; j++) {
        var card = cards[j];
        var on = today === event.date &&
          !card.classList.contains('ghost') &&
          minutes >= Number(card.getAttribute('data-s')) &&
          minutes < Number(card.getAttribute('data-e'));
        if (on) card.classList.add('now'); else card.classList.remove('now');
      }
    } catch (err) {}
  }
  tick();
  setInterval(tick, 60000);
})();`
