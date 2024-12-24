// server.js
const express = require("express");
const port = 3000;
const app = express();
const path = require("path");
const dotenv = require("dotenv").config();

app.use(express.json()); // For parsing application/json
app.get("/", function (request, response) {
  app.use("/components", express.static("./src/components"));
  app.use("/game", express.static("./src/game"));
  app.use("/modules", express.static("./src/modules"));
  app.use("/resources", express.static("./src/resources"));
  app.use("/views", express.static("./src/views"));
  response.sendFile(__dirname + "/src/views/index.html");
});

var server = app.listen(process.env.PORT || port, listen);

// This call back just tells us that the server has started
function listen() {
  var host = server.address().address;
  var port = server.address().port;
  console.log("App listening at http://" + host + ":" + port);
  console.log("App listening at http://localhost:" + port);
}
