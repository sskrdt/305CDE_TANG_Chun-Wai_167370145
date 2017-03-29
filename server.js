var http = require("http");
var fs = require("fs");
var qs = require("querystring");
var mongodb = require("mongodb");
var MongoClient = require("mongodb").MongoClient;
require("events").EventEmitter.prototype._maxListeners = 100;

var mongodbServer = new mongodb.Server("localhost", 27017, { auto_reconnect: true, poolSize: 10 });
var db = new mongodb.Db("database", mongodbServer);

var isProg = false, isLogin = false, isAdded=false;
var logAc="",logNum=0;
var rep_user = false, rep_ac = false, rep_email = false;
var isSongAdded = false, fav_list="", isSongRemove = false;

var server = http.createServer(function(request, response){
	if(request.method == "POST"){
		var formData = "", msg = "", obj = "";
		
		return request.on("data", function(data) {
			formData += data;
			return request.on("end", function(){
				var user;
				user = qs.parse(formData);
				msg = JSON.stringify(user);
				
				response.writeHead(200,{
					"Content-Type":"application/json",
					"Content-Length": msg.length
				});
				
				obj = JSON.parse(msg);
				
				if(request.url == "/login.html"){
					var ac = obj.ac;
					var pw = obj.pw;
					
					if (obj.act == "signup") { //signup 
						var email = obj.email;
						
						console.log("ac :"+ac+"\npw :"+pw+"\nemail:"+email);
						
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								collection.find().toArray(function(err, items) {
									if(err) throw err;
									
									if (items != "") {
										for (var i=0; i<items.length; i++) {
											if (ac == items[i].ac && email == items[i].email) {
												rep_user = true;
											} else if (ac == items[i].ac) {
												rep_ac = true;
											} else if (email == items[i].email) {
												rep_email = true;
											}
											if (ac == items[i].ac || email == items[i].email) {
												return;
											}
										}
									}
									addUser(obj);
								});
							});	
						});
					}else if (obj.act == "login") {//login
						console.log("ac :"+ac+"\npw :"+pw);
						
						if(ac != "" && pw != "")
							isProg = true;
						
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function(err, collection){
								collection.find().toArray(function(err, items){
									if(err)throw err;
								
									if(items != ""){
										for(var i=0; i<items.length; i++){
											if(ac == items[i].ac && pw == items[i].pw){
												logAc = ac;
												logNum = i;
												isLogin = true;
												console.log("Connected to account: "+ac);
											}
										}
									}
								});
							});
						});
					}
				}
				
				if(request.url == "/index.html"){
					if(obj.act == "logout"){//logout
						isLogin = false;
						console.log("No user login");
					}else if (obj.act == "add_song"){//add song to favourite list
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								collection.update({ac: logAc}, { $push: { favourite: obj.song} }, {w:1}, function(err, result){
									if(err) throw err;    
									
									isSongAdded = true;
									console.log("one song added to favourite list");
								});
								collection.find().toArray(function(err, items) {
									if(err) throw err;
									
									fav_list = items[logNum].favourite;
								});
							});		
						});
					}else if (obj.act == "remove_song"){//remove song from favourite list
						MongoClient.connect("mongodb://localhost:27017/database", function (err, db) {
							db.collection("user", function (err, collection) {
								collection.update({ac: logAc}, { $pull: { favourite: obj.song} }, {w:1}, function(err, result){
								if(err) throw err;
									isSongAdded = true;
									isSongRemove = true;
									console.log("one song reomved from favourite list");
								});
								
								collection.find().toArray(function(err, items) {
									if(err) throw err;    
									fav_list = items[logNum].favourite;
								});
							});
						});
					}
				}
				return response.end();
			});
		});
	} else {
		fs.readFile("./" + request.url, function (err, data) {
			var dotoffset = request.url.lastIndexOf(".");
			var mimetype = dotoffset == -1
				? "text/plain"
				: {
					".html": "text/html",
					".ico" : "image/x-icon",
					".jpg" : "image/jpeg",
					".png" : "image/png",
					".gif" : "image/gif",
					".css" : "text/css",
					".js"  : "text/javascript"
					
				}[request.url.substr(dotoffset)];
			if (!err) {
				response.setHeader("Content-Type", mimetype);
				response.end(data);
			} else {
				response.writeHead(302, {"Location": "http://localhost:7000/index.html"});
				response.end();
			}
		});
    }
});

server.listen(7000);
console.log("Server : http://127.0.0.1:7000/");

function addUser(obj){
	db.open(function(){
		db.collection("user", function(err, collection){
			collection.insert({
				ac: obj.ac,
				pw: obj.pw,
				email: obj.email
			}, function(err, data){
				if(data){
					console.log("Added a new user to database");
					isAdded = true;
				}else{
					console.log("Add a new user to database failed");
				}
			});
		});
	});
}

var io = require("socket.io").listen(server);

function update(){
	//login status
	if(isLogin == true){
		io.emit("login_succ",{message: "success", ac: logAc, fav_list: fav_list});
	}else{
		if(isProg == true){
			io.emit("login_fail", {message: "failure"});
			isProg = false;
		}else{
			io.emit("no_user", {message: "failure"});
		}
	}
	
	//create user
	if(isAdded == true) {
		io.emit("add_successful", {message: "success"});
		isAdded = false;
	}
	
	//information status
	if(rep_user == true){
		io.emit("reapeat_account",{message: "failure"});
		rep_user = false;
	}else if(rep_ac == true){
		io.emit("reapeat_user",{message: "failure"});
		rep_ac = false;
	}else if (rep_email == true){
		io.emit("reapeat_email",{message: "failure"});
		rep_email = false;
	}
	
	//add song status
	if(isSongAdded == true){
		if(isSongRemove == false){
			io.emit("list_updated", {message: "success", fav_list: fav_list});
		}else{
			io.emit("song_removed", { message: "success", fav_list: fav_list });
			isSongRemove=false;
		}
		isSongAdded = false;
	}
}
setInterval(update, 500);