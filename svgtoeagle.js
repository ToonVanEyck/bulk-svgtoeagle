// var container,canvas,ctx;
var FLIP_HORIZ = true;
var SCALE = 1/90;
// var DRAWSCALE = 1/SCALE;
var SUBSAMPLING = 5; // subsampling of SVG path
var SIMPLIFY = 0.1*SCALE;
var SIMPLIFYHQ = false;
var TRACEWIDTH = 0.1; // in mm

// Start file download.
function download_script(filename, out_scr) {
  var text = out_scr;

  var element = document.createElement('a');
  element.style.display = 'none';

  var filename = filename + ".scr";

  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

function dist(a,b) {
  var dx = a.x-b.x;
  var dy = a.y-b.y;
  return Math.sqrt(dx*dx+dy*dy);
}

function isInside(point, poly) {
  // ray-casting algorithm based on
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
  var x = point.x, y = point.y;
  var inside = false;
  for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    var xi = poly[i].x, yi = poly[i].y;
    var xj = poly[j].x, yj = poly[j].y;

    var intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

function polygonArea(poly) {
  //https://stackoverflow.com/questions/14505565/detect-if-a-set-of-points-in-an-array-that-are-the-vertices-of-a-complex-polygon
  var area = 0;
  for (var i = 0; i < poly.length; i++) {
    j = (i + 1) % poly.length;
    area += poly[i].x * poly[j].y;
    area -= poly[j].x * poly[i].y;
  }
  return area / 2;
}

// Move a small distance away from path[idxa] towards path[idxb]
function interpPt(path, idxa, idxb) {
  var amt = TRACEWIDTH/8; // a fraction of the trace width so we don't get much of a notch in the line
  // wrap index
  if (idxb<0) idxb+=path.length;
  if (idxb>=path.length) idxb-=path.length;
  // get 2 pts
  var a = path[idxa];
  var b = path[idxb];
  var dx = b.x - a.x;
  var dy = b.y - a.y;
  var d = Math.sqrt(dx*dx + dy*dy);
  if (amt > d) return []; // return nothing - will just end up using the last point
  return [{
    x : a.x + (dx*amt/d),
    y : a.y + (dy*amt/d)
  }];
}

function unpackPoly(poly) {
  // ensure all polys are the right way around
  for (var p=0;p<poly.length;p++) {
    if (polygonArea(poly[p])>0)
      poly[p].reverse();
  }
  var finalPolys = [poly[0]];
  for (var p=1;p<poly.length;p++) {
    var path = poly[p];

    var outerPolyIndex = undefined;
    for (var i=0;i<finalPolys.length;i++) {
      if (isInside(path[0], finalPolys[i])) {
        outerPolyIndex = i;
        break;
      } else if (isInside(finalPolys[i][0], path)) {
        // polys in wrong order - old one is inside new one
        var t = path;
        path = finalPolys[i];
        finalPolys[i] = t;
        outerPolyIndex = i;
        break;
      }
    }

    if (outerPolyIndex!==undefined) {
      path.reverse(); // reverse poly
      var outerPoly = finalPolys[outerPolyIndex];
      var minDist = 10000000000;
      var minOuter,minPath;
      for (var a=0;a<outerPoly.length;a++)
        for (var b=0;b<path.length;b++) {
          var l = dist(outerPoly[a],path[b]);
          if (l<minDist) {
            minDist = l;
            minOuter = a;
            minPath = b;
          }
        }
      // splice the inner poly into the outer poly
      // but we have to recess the two joins a little
      // otherwise Eagle reports Invalid poly when filling
      // the top layer
      finalPolys[outerPolyIndex] =
        outerPoly.slice(0, minOuter).concat(
          interpPt(outerPoly,minOuter,minOuter-1),
          interpPt(path,minPath,minPath+1),
          path.slice(minPath+1),
          path.slice(0,minPath),
          interpPt(path,minPath,minPath-1),
          interpPt(outerPoly,minOuter,minOuter+1),
          outerPoly.slice(minOuter+1)
        );
    } else {
      // not inside, just add this poly
      finalPolys.push(path);
    }
  }
  return finalPolys;
}

function drawSVG(input_svg,layer) {

  TRACEWIDTH = 0.1;
  SUBSAMPLING = 5;
  FLIP_HORIZ = false;
  var EAGLE_LAYER = layer
  var SIGNAL_NAME = "GND"
  var EAGLE_FORMAT = "library";

  let out_scr = ""
  function out(x) {
    out_scr += x;
  }
  var size = input_svg.viewBox.baseVal;
  if (size.width==0 || size.height==0) {
    size = {
      width : input_svg.width.baseVal.value,
      height : input_svg.height.baseVal.value
    };
  }

  var specifiedWidth = input_svg.getAttribute("width");
  if (specifiedWidth && specifiedWidth.match(/[0-9.]*mm/)) {
    specifiedWidth = parseFloat(specifiedWidth.slice(0,-2));
    SCALE = specifiedWidth / size.width;
  } else if (specifiedWidth && specifiedWidth.match(/[0-9.]*in/)) {
    specifiedWidth = parseFloat(specifiedWidth.slice(0,-2))*25.4;
    SCALE = specifiedWidth / size.width;
  } else {
    SCALE = 1/parseFloat(1);
  }

  var exportHeight = size.height*SCALE;

  if (EAGLE_FORMAT == "board") {
    out("CHANGE layer "+EAGLE_LAYER+"; CHANGE rank 3; CHANGE pour solid; SET WIRE_BEND 2;\n");
  } if (EAGLE_FORMAT == "library") {
    out("CHANGE layer "+EAGLE_LAYER+"; CHANGE pour solid; Grid mm; SET WIRE_BEND 2;\n");
  }

  var col = 0;
  var paths = input_svg.getElementsByTagName("path");
  if (paths.length==0)
    log("No paths found. Did you use 'Object to path' in Inkscape?");

  for (var i=0;i<paths.length;i++) {
    var path = paths[i]; // SVGPathElement
    var filled = (path.style.fill!==undefined && path.style.fill!="" && path.style.fill!="none") || path.hasAttribute('fill');
    var stroked = (path.style.stroke!==undefined && path.style.stroke!="" && path.style.stroke!="none");
    if (!(filled || stroked)) continue; // not drawable (clip path?)
    var transform = path.transform.baseVal[0].matrix;
    var l = path.getTotalLength();
    var divs = Math.round(l*SUBSAMPLING);
    if (divs<3) divs = 3;
    var maxLen = l * 1.5 * SCALE / divs;
    var p = path.getPointAtLength(0).matrixTransform(transform);
    if (FLIP_HORIZ) p.x = size.width-p.x;
    p = {x:p.x*SCALE, y:p.y*SCALE};
    var last = p;
    var polys = [];
    var points = [];
    for (var s=0;s<=divs;s++) {
      p = path.getPointAtLength(s*l/divs).matrixTransform(transform);
      if (FLIP_HORIZ) p.x = size.width-p.x;
      p = {x:p.x*SCALE, y:p.y*SCALE};
      if (dist(p,last)>maxLen) {
        if (points.length>1) {
          points = simplify(points, SIMPLIFY, SIMPLIFYHQ);
          polys.push(points);
        }
        points = [p];
      } else {
        points.push(p);
      }
      last = p;
    }
    if (points.length>1) {
      points = simplify(points, SIMPLIFY, SIMPLIFYHQ);
      polys.push(points);
    }

    if (filled)
      polys = unpackPoly(polys);

    polys.forEach(function (points) {
      if (points.length<2) return;
      var scriptLine;
      if (filled) {
        // re-add final point so we loop around
        points.push(points[0]);
        if (EAGLE_FORMAT == "board") {
          scriptLine = "polygon "+SIGNAL_NAME+" "+TRACEWIDTH+"mm"
        } if (EAGLE_FORMAT == "library") {
          scriptLine = "polygon "+TRACEWIDTH+"mm"
        }
      } else { // lines
        if (EAGLE_FORMAT == "board") {
          scriptLine = "wire "+SIGNAL_NAME+" "+TRACEWIDTH+"mm"
        } if (EAGLE_FORMAT == "library") {
          scriptLine = "wire "+TRACEWIDTH+"mm"
        }
      }
      points.forEach(function(p) { scriptLine += ` (${p.x.toFixed(6)}mm ${(exportHeight-p.y).toFixed(6)}mm)`});
      scriptLine += ";"
      out(scriptLine+"\n");
    });
  }
  return out_scr;
}


function convert() {
  var allFiles = document.getElementById("fileLoader").files;
  
  
  for(file of allFiles){
    var reader = new FileReader();
    reader.onload = function(event) {
    console.log(event.target.fileName)
    var file_name = event.target.fileName
    var file_data = event.target.result;
    var parser = new DOMParser();
    var svg = parser.parseFromString(file_data,'text/html').lastChild.lastChild.firstChild
    
    var file_patten = /([^\\\/]+\.([a-zA-Z]+))\.svg$/i;

    var base_name = file_name.match(file_patten)[1]
    var layer = file_name.match(file_patten)[2]

    download_script(base_name,drawSVG(svg,layer));
  };
  
    reader.fileName = file.name
    reader.readAsText(file);
  }
}
