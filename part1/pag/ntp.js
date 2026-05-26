
function faviconURL(u) {
  const url = new URL(chrome.runtime.getURL('/_favicon/'));
  url.searchParams.set('pageUrl', u);
  url.searchParams.set('size', '32');
  return url.toString();
}

function getv_isited(datalist,listid) {
    var list = document.getElementById(listid);
	
	function addEl(site) {
        var _li = document.createElement('div');
        var _aa = document.createElement('a');
        var _ic = document.createElement('img');
        var _p = document.createElement('span');

		_li.classList.add("fli");
		_ic.classList.add("ic");
		_p.classList.add("dl");
		
		_ic.src = faviconURL(site.url);
		_aa.href = site.url;
		_aa.draggable="true";
		_aa.setAttribute('aria-label',site.title);
		
		_p.textContent = site.title;
		
		_li.appendChild(_aa);
		_li.appendChild(_p);
		_li.appendChild(_ic);
		
        list.appendChild(_li);
    }
	
	
	
	if(Array.isArray(datalist)){
		datalist.forEach(addEl);	
	}else{
		
       for (var _d in datalist) {
		   
		var t='{"title":"'+_d +'", "url":"'+datalist[_d]+'"}';
		addEl(JSON.parse(t));
	   }
	}
}


//===============
//显示菜单
function showDiv_seting_hid() {
    var Div_seting_hid = document.getElementById("Div_seting_hid");
    if ($('#Div_seting_hid').css('display') === 'none') {
      $('#Div_seting_hid').css('display', 'block');
    } else {
      $('#Div_seting_hid').css('display', 'none');
    }
}
// 
$(document).ready(function() {
    $("#Div_seting").click(function() {
        showDiv_seting_hid()
    });
});
//===============
//添加收藏
function addLink(){
	const de = document.getElementById('fov-list');
	while (de.firstChild) {
		de.removeChild(de.firstChild);
	}
	
	var title = document.getElementById('u_title').value;
    var url = document.getElementById('u_url').value;
	var data;

	chrome.storage.local.get('Fav',function(result) {
		data=result;
		data.$[title]=url;
		console.log(data)
	});
	
    chrome.storage.local.set({'Fav':data}, function() {
      chrome.storage.local.get('Fav', function(result) {
      var a = result.Fav;
      getv_isited(result.Fav,"fov-list")
      });
    });
	
	
    closeInputWindow();
}

function closeInputWindow() {
    document.getElementById("inputWindow").style.display = "none";
}

function add_drop_zoone() {
    const dropzone=document.getElementById("fov-list")
	
	dropzone.addEventListener('dragover', (event) => {
        event.preventDefault();
		dropzone.style.backgroundColor = '#666';
     });
    dropzone.addEventListener('dragleave', () => {
        dropzone.style.backgroundColor = 'transparent';
     });

    dropzone.addEventListener('drop', (event) => {
        event.preventDefault();
		dropzone.style.backgroundColor = 'transparent';
        var link = event.dataTransfer.getData('text/html')
		var temp = document.createElement('div');
			temp.innerHTML = link;
			link=temp.firstChild;
			
		document.getElementById("inputWindow").style.display = "block";
		

		document.getElementById("u_title").value = link.getAttribute('aria-label');
		document.getElementById("u_url").value=link.href;
		
		
    });
}





//初始化绑定


//载列出最常访问和收藏
window.onload = function () {
	
  chrome.topSites.get().then((mostVisitedURLs) => {
    getv_isited(mostVisitedURLs,'most-visited-list')
  });

  chrome.storage.local.get('Fav', function(result) {
    var a = result.Fav;
    getv_isited(result.Fav,"fov-list")
  });
  
  init();
};

function init() {
    document.getElementById('btnok').onclick =addLink;
    document.getElementById('btncancel').onclick = closeInputWindow ;
    add_drop_zoone();

}