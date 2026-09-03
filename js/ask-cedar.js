(function () {
  var INDEX = [
    { title: "Sleeps 14 guests", snippet: "5 bedrooms, 9 real beds plus a downstairs sleeper sofa — sleeps up to 14 comfortably.", url: "stay.html#sleeps", keywords: "how many guests sleep capacity max maximum occupancy beds" },
    { title: "House layout — two floors", snippet: "Main Floor (Emerald, Pine, Adventure Rooms) and Basement / Lower Level (Mountain King Room, Double Bunk Room).", url: "stay.html", keywords: "floors upstairs downstairs layout main floor basement lower level rooms" },
    { title: "Emerald Room + private en-suite", snippet: "King bed, dual-monitor workspace, and Cedar Escape's only private en-suite bathroom.", url: "stay.html", keywords: "emerald room king bed ensuite en-suite private bathroom workspace desk" },
    { title: "Double Bunk Room", snippet: "Bunk beds in the basement/lower level — great for kids or extra guests.", url: "stay.html", keywords: "bunk beds bunk room kids children basement lower level" },
    { title: "Mountain Room (basement king)", snippet: "A king bedroom in the basement / lower level.", url: "stay.html", keywords: "mountain room basement king bedroom lower level" },
    { title: "Bathrooms", snippet: "Main-Floor Hall Bathroom, Emerald Room en-suite, and a Lower-Level Bathroom — 3 full baths total.", url: "stay.html", keywords: "bathroom bathrooms shower tub full baths" },
    { title: "Kitchen + Coffee", snippet: "Full kitchen, Keurig K-Duo, air fryer, indoor griddle, and a Traeger grill with pellets.", url: "plan-your-trip.html#pack", keywords: "coffee keurig kitchen cooking grill traeger air fryer" },
    { title: "Family gear", snippet: "High chair, Pack 'n Play, toddler dinnerware, safety gates, and toys are already at the house.", url: "plan-your-trip.html#pack", keywords: "high chair pack n play crib kids toddler family gear baby" },
    { title: "Entertainment", snippet: "Movie room, pool table, arcade, VR, board games, and high-speed Wi-Fi.", url: "stay.html", keywords: "movie room game room pool table arcade vr wifi entertainment" },
    { title: "Work + Fitness", snippet: "Dedicated workspaces, fast Wi-Fi, and a Peloton bike with free weights.", url: "stay.html", keywords: "work fitness gym peloton wifi workspace desk" },
    { title: "Booking direct is cheaper", snippet: "Book directly with Cedar Escape to skip third-party platform fees — live availability and secure checkout.", url: "check-availability.html", keywords: "book direct reserve reservation booking cheaper fees price cost" },
    { title: "Cancellation policy", snippet: "See the Booking category in the FAQ for our full cancellation policy.", url: "faq.html", keywords: "cancellation cancel refund policy change dates" },
    { title: "House rules", snippet: "No pets, no smoking, no parties/events beyond your registered guest count. Quiet hours 10 PM–7 AM.", url: "faq.html", keywords: "pets smoking parties events quiet hours rules policy hot tub" },
    { title: "Check-in / check-out times", snippet: "Check-in is at 4:00 PM, check-out is at 11:00 AM.", url: "faq.html", keywords: "check in check out time arrival departure" },
    { title: "Do I need 4WD or AWD?", snippet: "No specific vehicle requirement — paved resort roads. A standard car, SUV, or truck works under normal conditions; check winter road conditions before you travel.", url: "faq.html", keywords: "4wd awd 4x4 vehicle car snow winter roads driving directions" },
    { title: "Parking", snippet: "The driveway comfortably fits 3–4 cars, with free overflow parking available.", url: "faq.html", keywords: "parking park driveway cars overflow" },
    { title: "Massanutten Resort activities", snippet: "WaterPark, skiing & snowboarding, snow tubing, Adventure Park, golf, scenic chairlift, and spa — all inside the resort.", url: "explore-massanutten.html#resort", keywords: "waterpark water park ski skiing snowboard snow tubing golf adventure park chairlift spa massanutten resort activities" },
    { title: "Restaurants near Cedar Escape", snippet: "Hank's Grille, Romano's Italian Bistro, Thirsty's Burgers, Thunderbird Cafe, Santa Fe Mexican Grille and more, grouped by distance.", url: "explore-massanutten.html#eat-drink", keywords: "restaurants food eat dinner where to eat dining" },
    { title: "Catering", snippet: "Hank's Grille & Catering and Crossroads Cafe & Catering — good for arrival-night meals or large groups.", url: "explore-massanutten.html#catering", keywords: "catering caterer group meal delivery food service" },
    { title: "Wineries + breweries", snippet: "CrossKeys Vineyards, Brix & Columns Vineyards, Pale Fire Brewing, Feel the Rain Brothers Brew Co. and more around the Shenandoah Valley.", url: "explore-massanutten.html#wineries", keywords: "wine winery wineries vineyard brewery breweries beer cider" },
    { title: "Groceries + Essentials", snippet: "Food Lion, Walmart Neighborhood Market, Target, CVS Pharmacy, and The Market at Massanutten.", url: "explore-massanutten.html#groceries", keywords: "groceries grocery store food lion walmart target cvs pharmacy shopping essentials where is" },
    { title: "Walmart grocery delivery", snippet: "Prefer to skip the grocery stop? Schedule a Walmart delivery for around your arrival time so the fridge is stocked without another trip out.", url: "explore-massanutten.html#groceries", keywords: "walmart delivery grocery delivery order online arrival groceries delivered" },
    { title: "JMU / James Madison University", snippet: "Cedar Escape is a short drive from JMU — see the dedicated JMU Weekend guide for game-day planning.", url: "cedar-escape-jmu-weekend.html", keywords: "jmu james madison university college game day football distance how far" },
    { title: "Mountain Weather", snippet: "Live current conditions for the Massanutten area, powered by BetterSTR.", url: "explore-massanutten.html#things-to-do", keywords: "weather forecast temperature conditions" },
    { title: "What's provided vs. what to bring", snippet: "Linens, bath towels, hand towels, washcloths and starter toiletries are all provided.", url: "plan-your-trip.html#pack", keywords: "linens towels toiletries provided bring pack packing list" },
    { title: "Digital guide", snippet: "Booked guests receive a detailed digital guide (arrival info, Wi-Fi, house tips) within 48 hours of booking.", url: "plan-your-trip.html", keywords: "digital guide wifi password door code check-in instructions guidebook" },
    { title: "Message Us", snippet: "Have a question about your stay or an upcoming booking? Send a note — no account needed.", url: "faq.html", keywords: "contact message us question help support" }
  ];

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function scoreEntry(entry, terms) {
    var hay = (entry.title + " " + entry.snippet + " " + entry.keywords).toLowerCase();
    var s = 0;
    terms.forEach(function (t) {
      if (!t) return;
      if (hay.indexOf(t) !== -1) s += 1;
      if (entry.title.toLowerCase().indexOf(t) !== -1) s += 1;
    });
    return s;
  }

  function runSearch(query) {
    var terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];
    return INDEX
      .map(function (e) { return { entry: e, s: scoreEntry(e, terms) }; })
      .filter(function (r) { return r.s > 0; })
      .sort(function (a, b) { return b.s - a.s; })
      .slice(0, 8)
      .map(function (r) { return r.entry; });
  }

  function init() {
    var btn = document.getElementById("askCedarBtn");
    var mobileBtn = document.getElementById("askCedarMobileBtn");
    var panel = document.getElementById("askCedarPanel");
    var input = document.getElementById("askCedarInput");
    var results = document.getElementById("askCedarResults");
    var closeBtn = document.getElementById("askCedarClose");
    if (!btn || !panel || !input || !results || !closeBtn) return;

    function renderResults(list, query) {
      if (!query.trim()) {
        results.innerHTML = '<p class="ac-hint">Try: &ldquo;high chair&rdquo;, &ldquo;Walmart&rdquo;, &ldquo;4WD&rdquo;, &ldquo;JMU&rdquo;, &ldquo;WaterPark&rdquo;, &ldquo;coffee&rdquo;, &ldquo;bunk beds&rdquo;, &ldquo;cancellation&rdquo;</p>';
        return;
      }
      if (!list.length) {
        results.innerHTML = '<p class="ac-hint">No matches on the website yet for that — try Message Us below and we\'ll get you a real answer.</p>';
        return;
      }
      results.innerHTML = list.map(function (e) {
        return '<a class="ac-result" href="' + e.url + '">' +
          '<div class="ac-result-title">' + escapeHtml(e.title) + '</div>' +
          '<div class="ac-result-snippet">' + escapeHtml(e.snippet) + '</div>' +
        '</a>';
      }).join("");
    }

    function openPanel() {
      panel.hidden = false;
      renderResults([], "");
      setTimeout(function () { input.focus(); }, 50);
    }
    function closePanel() {
      panel.hidden = true;
    }

    function toggle() {
      if (panel.hidden) openPanel(); else closePanel();
    }

    btn.addEventListener("click", toggle);
    if (mobileBtn) mobileBtn.addEventListener("click", toggle);
    closeBtn.addEventListener("click", closePanel);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) closePanel();
    });
    input.addEventListener("input", function () {
      renderResults(runSearch(input.value), input.value);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
