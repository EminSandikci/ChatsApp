var app = require('express')();
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

var mysql = require('mysql');

var con = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "nodeproje"
});
con.connect(function (err) {
  if (err) throw err;
  console.log("Connected!");
});


var user_soket_liste = [];
var online_user = [];


function getGroups(socketUser,name) {
  var sql = "SELECT grup_adi FROM grup_bilgiler WHERE kullanici_adi='"+name+"'";
  var result = con.query(sql, function (err, result) {
    if (err) throw err;

    socketUser.emit("getGroups", result);
  });
}
function getKullanicilar(socketUser) {
  var sql = "SELECT kullanici_adi FROM kullanici_bilgiler";
  con.query(sql, function (err, result) {
    if (err) throw err;
    var kullanicilar = [];
    var durum="";

    result.forEach(element => {
      if(online_user.indexOf(element.kullanici_adi)>=0) durum="Online";
      else durum="Offline";

      kullanicilar.push({
        username:element.kullanici_adi,
        state:durum
      });
    });

    socketUser.emit("getUsers", kullanicilar);
  });
}



function getGenelMesaj(socketUser) {
  var sql = "SELECT * FROM genel_mesaj";
  con.query(sql, function (err, result) {
    if (err) throw err;
    var genel_mesajlar = [];
    result.forEach(element => {
      genel_mesajlar.push({
        username: element.kullanici_adi,
        message: element.mesaj
      });
    });

    socketUser.emit("resposeMessage", genel_mesajlar);
  });
}
function getGrupMesaj(socketUser, name) {
  var sql = "SELECT kullanici_adi,mesaj FROM grup_mesaj WHERE grup_adi='"+name+"'";
  con.query(sql, function (err, result) {
    if (err) throw err;
    var grup_mesajlar=[];
    result.forEach(element => {
      grup_mesajlar.push({
        username: element.kullanici_adi,
        message: element.mesaj
      });
    });

    socketUser.emit("resposeMessage", grup_mesajlar);
  });
}
function getKullaniciMesaj(socketUser, data) {
  var sql = "SELECT kaynak_kullanici_adi,mesaj FROM kullanici_mesaj WHERE"+
            "(kaynak_kullanici_adi ='"+data.source+"' AND hedef_kullanici_adi='"+data.target+"') OR "+
            "(kaynak_kullanici_adi ='"+data.target+"' AND hedef_kullanici_adi='"+data.source+"')";
  con.query(sql, function (err, result) {
    if (err) throw err;
    var kullanici_mesajlar=[];
    result.forEach(element => {
      kullanici_mesajlar.push({
        username: element.kaynak_kullanici_adi,
        message: element.mesaj
      });
    });

    socketUser.emit("resposeMessage", kullanici_mesajlar);
  });
}



app.get("/", (req, res) => {
  res.sendFile(__dirname + "/chat/users.html");
});

app.post("/singin", (req, res) => {
  var user = req.body.username;
  var email = req.body.email;
  var password = req.body.password;
  var kontrol = "SELECT id FROM kullanici_bilgiler WHERE kullanici_adi='"+user+"'";
  con.query(kontrol,function(er,sonuc){
    if (er) throw er;
    if(sonuc.length != 0){
      console.log("kullanıcı zaten var");
      res.redirect('/?massage=singin');
      res.sendFile(__dirname + "/chat/users.html");
    }else{
      var sql = "INSERT INTO kullanici_bilgiler (kullanici_adi, sifre, eposta) VALUES ('" + user + "', '" + password + "','" + email + "')";
      con.query(sql, function (err, result) {
        if (err) throw err;
        console.log("a user inserted");
        io.emit("userTrigger",{username:user});
      });
      res.redirect('/?massage=success');
      res.sendFile(__dirname + "/chat/users.html");
      console.log("singin");
    }
  });
});

app.post("/login", (req, res) => {
  var username = req.body.username;
  var password = req.body.password;
  var sql = "SELECT * FROM kullanici_bilgiler WHERE kullanici_adi = '" + username + "' AND sifre = '" + password + "'";
  con.query(sql, function (err, result) {
    if (err) throw err;
    if (result.length != 0) {
      res.redirect('/chat?username=' + username);
    } else {
      console.log("login error");
      res.redirect('/?massage=login');
      res.sendFile(__dirname + "/chat/users.html");
    }
  });
});

app.get("/chat", (req, res) => {
  res.sendFile(__dirname + "/chat/chat.html");
});



io.on('connection', (socket) => {
  console.log("a client connection");

  socket.on("set_username", (data) => {
    user_soket_liste.push({
      username: data,
      sockets: socket
    });
    online_user.push(data);
    console.log(data);

    io.emit("usersState",{state:"Online",username:data});
  });



  socket.on("groupFetchMembers", (name) => {
    getGroups(socket,name);
  });
  socket.on("usersFetchMembers", () => {
    getKullanicilar(socket);
  });



  socket.on("fetchGlobalMessage", () => {
    getGenelMesaj(socket);
  });
  socket.on("fetchGroupMessage",(data)=>{
    getGrupMesaj(socket,data);
  });
  socket.on("fetchUserMessage",(data)=>{
    getKullaniciMesaj(socket,data);
  });



  socket.on("globalMessage", (data) => {
    console.log("[" + data.username + "] : " + data.message)
    var sql = "INSERT INTO genel_mesaj(kullanici_adi,mesaj) VALUES('" + data.username + "','" + data.message + "')";
    con.query(sql, function (err, result) {
      if (err) throw err;
      console.log("a global mes save");
      io.emit("messageTrigger",{type:"global",username:data.username,message:data.message}); //baglantili bütün kullanicilara gönder
    });
  });
  socket.on("groupMessage", (data) => {
    console.log("[" + data.username + "] : " + data.message)
    var sql = "INSERT INTO grup_mesaj(kullanici_adi,grup_adi,mesaj) VALUES('" + data.username + "','" + data.group + "','" + data.message + "')";
    con.query(sql, function (err, result) {
      if (err) throw err;
      var groupMembers = "SELECT kullanici_adi FROM grup_bilgiler WHERE grup_adi='"+data.group+"'";
      con.query(groupMembers, function (err, result) {
        if (err) throw err;
        result.forEach(element => {
          var targetIndex = user_soket_liste.map(function (elements) { return elements.username; }).indexOf(element.kullanici_adi);
          if(targetIndex<0) return;
          user_soket_liste[targetIndex].sockets.emit("messageTrigger",{type:"group",target:data.group,username:data.username,message:data.message});
        });
      });
    });
  });
  socket.on("userMessage", (data) => {
    console.log("[" + data.sourceUser + "] : " + data.message)
    var sql = "INSERT INTO kullanici_mesaj(kaynak_kullanici_adi,hedef_kullanici_adi,mesaj) VALUES('" + data.sourceUser + "','" + data.targetUser + "','" + data.message + "')";
    con.query(sql, function (err, result) {
      if (err) throw err;
      console.log("a user mes save");
      var targetIndex = user_soket_liste.map(function (element) { return element.username; }).indexOf(data.targetUser);
      if(targetIndex<0) return;
      user_soket_liste[targetIndex].sockets.emit("messageTrigger",{type:"user",target:data.sourceUser,username:data.sourceUser,message:data.message});
    });
  });


  socket.on("groupAdd",(data)=>{
    var sql = "SELECT grup_adi FROM grup_bilgiler WHERE grup_adi = '" + data[0].group_name + "'";
    con.query(sql,function (err, result){
      if(result.length == 0){
        data.forEach(element => {
          var insert = "INSERT INTO grup_bilgiler(grup_adi,kullanici_adi) VALUES('"+element.group_name+"','"+element.name+"')";
          con.query(insert,function(er,res) {
            if(er) throw er;
            
            var findUserSocket = user_soket_liste.map(function (element) { return element.username; }).indexOf(element.name);
            if(findUserSocket<0) return;
            
            user_soket_liste[findUserSocket].sockets.emit("groupTrigger",element.group_name);
          });
        });
      }else console.log("zeten grup var");
    });
  });

  socket.on("deleteGroup",(data)=>{
    console.log(data.username+" -- "+data.group_name)
    var sql = "DELETE FROM grup_bilgiler WHERE grup_adi = '"+data.group_name+"' AND kullanici_adi = '"+data.username+"'";
    con.query(sql,function(err,result){
      if(err) throw err;
      var deleteSql = "DELETE FROM grup_mesaj WHERE grup_adi = '"+data.group_name+"' AND kullanici_adi = '"+data.username+"'"
      con.query(deleteSql,function(er,res){
        if(er) throw er;
      });
    });
  });


  socket.on("disconnect", (msg) => {
    var index = user_soket_liste.map(function (element) { return element.sockets; }).indexOf(socket);

    var deleteUser = user_soket_liste[index].username;
    console.log("singout user: "+deleteUser);
    var indexDeleteUser = online_user.indexOf(deleteUser);
    io.emit("usersState",{state:"Offline",username:deleteUser});

    online_user.splice(indexDeleteUser,1);
    user_soket_liste.splice(index, 1);
  });
});

http.listen(3000, () => {
  console.log("listening on :3000");
});