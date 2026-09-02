// DevTools panels are created with paths relative to the extension root
chrome.devtools.panels.create(
  "Mindra",
  "", // panel icon
  "devtools/panel.html", // relative path to panel HTML from extension root
  (panel) => {
    console.log("Mindra DevTools Panel created successfully.");
  }
);
