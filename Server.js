var fs = require('fs-extra');
var forge = require('node-forge');
var onlyPath = require('path');
var LinvoDB = require("linvodb3");
var zip = new require('node-zip')();

rootData = "/Users/guest/Library/Containers/com.readmoo.readmoodesktop/Readmoo/";
pathBook = "/Users/guest/Library/Containers/com.readmoo.readmoodesktop/Readmoo/api/book/"
localStoragePath = "/Users/guest/Library/Application Support/Readmoo/Local Storage/app_readmoo_0.localstorage";

LinvoDB.defaults.store = { db: require("medeadown") };
LinvoDB.dbPath = "./db/";

var encryptionDB = new LinvoDB("encryption", {}, {});

var encryptionMethods = {
    /*'http://www.idpf.org/2008/embedding': this.embeddedFontDeobfuscateIdpf,
    'http://ns.adobe.com/pdf/enc#RC': this.embeddedFontDeobfuscateAdobe,*/
    'http://www.w3.org/2001/04/xmlenc#aes128-cbc': aes256Decrypt //actually use aes256-cbc
};

// Get Pem
var sqlite = require('better-sqlite3');
var lsDB = new sqlite(localStoragePath);
var localStorageDatas = lsDB.prepare("SELECT value FROM ItemTable WHERE key = 'rsa_privateKey'").all();
var mypem = localStorageDatas[0].value;
mypem = mypem.toString().replace(/(\r\n|\n|\r)/gm, "");
console.log(mypem);

function aes256Decrypt(aesKey, fetchCallback, input, file, path){

      var iv = input.slice(0,16),
          ciphertext = input.slice(16),
          decipher = forge.cipher.createDecipher('AES-CBC', aesKey),
          // 2017/09/25 修正取得副檔名的方式
          type = file.split('.').pop();

          decipher.start({iv: iv});
          decipher.update(forge.util.createBuffer(ciphertext, 'binary'));
          decipher.finish(function(){ });

          var output = decipher.output;
          var padding_length = output.last();
          var plaintextBuffer = output.truncate(padding_length);
          if (type !== 'css') {
            var nodeBuffer = new Buffer(plaintextBuffer.getBytes(), 'binary');
            fetchCallback(nodeBuffer, plaintextBuffer.length());
          } else {
            fetchCallback(plaintextBuffer.toString(), plaintextBuffer.length());
          }
}

var decryptDocument = function(encryptionInfo, retrivalObj, input, file, path, fetchCallback) {
  // 2016/07/14 不支援就直接回傳空內容
  if (!retrivalObj) {
    fetchCallback("", 0);
    return
  }

  var cipher = retrivalObj.cipher
      pki = forge.pki
      kpr_pem = mypem
      kpr = pki.privateKeyFromPem(kpr_pem)
      ciphertext = forge.util.decode64(cipher)
      aesKey = kpr.decrypt(ciphertext)
      //TODO get decipher from Buffer directly
      encryptionAlgorithm = encryptionMethods[encryptionInfo.encryptionAlgorithm];
//console.log("AESKEY: ", aesKey);
  if(encryptionAlgorithm)
      encryptionAlgorithm.call(this, aesKey, fetchCallback, input, file, path);
  else
      console.log('not support this aes decryption mode yet');
};


var getRetrivalMethod = function (encryptionTable, RSA_id){
  // RSA_id = #EK 之類的
    for (var i=0; i< encryptionTable.rsakey.length; i++){
        // console.log('encryptionTable.rsakey[i].id: ' + encryptionTable.rsakey[i].id);
        if(RSA_id === encryptionTable.rsakey[i].id){
            //return cipherdata to rsa decode
            return {
                'algorithm': encryptionTable.rsakey[i].algorithm,
                'cipher': encryptionTable.rsakey[i].cipher
                //TODO decipher Buffer
            };
        }
    }
};

var openEncrypedBook = function(bookid, encryptedPath, encryptionTable, saveFile){
  var encryptionPath,
      encryptedPath,
      encryptionInfo,
      retrivalObj,
      _path = pathBook;

  encryptionPath = pathBook + bookid + '/META-INF/'+'encryption.xml';

  _path += bookid + '/' + encryptedPath; // osx32/64

  encryptionInfo = encryptionTable.encryptions[encryptedPath];
  if (encryptionInfo)
    retrivalObj = getRetrivalMethod(encryptionTable, encryptionInfo.RSA_ID);

  var input = fs.readFileSync(_path, {encoding: 'binary'});

  decryptDocument(encryptionInfo, retrivalObj, input, encryptedPath, _path, function(decryptedData, length){
    //存回檔案
    saveFile(decryptedData, bookid, encryptedPath);
  });
};


var decipherBook = function(bookid, encryptionTable, files) {
  var dir = process.cwd() + "/books/" + bookid;
  fs.copySync(pathBook+bookid, dir)

  var saveFile = function(data, bookid, path) {
    saveFilePath = dir+"/"+path;
    targetDir = onlyPath.dirname(saveFilePath);
    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (e) {};
    fs.writeFile(saveFilePath, data, function(err) {
      if(err) {
          return console.log(err);
      }  
    }); 
  };

  for (var key in files) {
    openEncrypedBook(bookid, key, encryptionTable, saveFile);
  }

};

var getTableOfBooks = function(){
  encryptionDB.find({}, function(err, docs){
    docs.forEach(function(doc){
      encryptionTable = JSON.parse(doc.table);
      var bookid, files;
      bookid = encryptionTable.bookid;
      files = encryptionTable.encryptions;

      decipherBook(bookid, encryptionTable, files);
    });
  });
};

var bookDir = process.cwd() + "/books"
if (!fs.existsSync(bookDir)){
  fs.mkdirSync(bookDir);
}

getTableOfBooks();

// Delete encryption.xml
// Zip the files and rename it to *.epub 
