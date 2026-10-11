import { TAU } from '../../src/util.js';
// Original textmode wordmark, revision 9. No font, traced image or external asset.
// Chiselled polygons are sampled on a fixed grid and encoded as half-block cells.
// The rows can be exported as editable Unicode art; geometry remains deterministic.
const FORMS = {
  S: [[[3,0],[14,0],[11,3],[4,3],[3,4],[3,6],[11,6],[14,9],[14,15],[11,18],[0,18],[3,15],[10,15],[11,14],[11,9.2],[3,9.2],[0,7],[0,3]]],
  H: [[[0,0],[3,0],[3,6],[10,6],[10,0],[13,0],[13,18],[10,18],[10,9],[3,9],[3,18],[0,18]]],
  U: [[[0,0],[3,0],[3,12.5],[5.5,14.8],[8.5,14.8],[11,12.5],[11,0],[14,0],[14,14.5],[10.5,18],[3.5,18],[0,14.5]]],
  T: [[[0,0],[16,0],[14,3.2],[9.5,3.2],[9.5,18],[6.5,18],[6.5,3.2],[0,3.2]]],
  L: [[[0,0],[3,0],[3,14.8],[14,14.8],[11,18],[0,18]]],
  E: [[[0,0],[14,0],[11,3],[3,3],[3,7],[11,7],[9,10],[3,10],[3,15],[14,15],[11,18],[0,18]]],
  B: [[[0,0],[11,0],[14,3],[14,7],[11,9],[14,11],[14,15],[11,18],[0,18]],[[3,3],[3,7],[9,7],[11,5],[11,3]],[[3,10],[3,15],[9,15],[11,13],[11,11],[9,10]]],
};
const inside = (x,y,points) => {
  let hit=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++) {
    const a=points[i], b=points[j];
    if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) hit=!hit;
  }
  return hit;
};
// Both words share one optical size. Preserve the established letter proportions;
// the lockup itself becomes wider because SHUTTLE contains seven full-size letters.
const TITLE_TYPE=Object.freeze({sx:1.4,sy:1.11,lean:.28,capHeight:18,
  verticalStem:3,crossbar:3.2,cellAspect:.34*124/52,sample:2,gap:1.6});
const {sx,sy,lean,sample:SAMPLE}=TITLE_TYPE;
// Small triangular edge tears from SX's preferred first outline study. Keep the
// original scale, counters and optical packing. A wound is at most 0.75 units deep.
function tornContour(polygon,index){
  const result=[];
  polygon.forEach((a,i)=>{
    const b=polygon[(i+1)%polygon.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
    result.push(a);
    if(length>4 && (i+index)%2===0){
      const t=.42+((index+i)%3)*.06,depth=.65;
      result.push([a[0]+dx*t,a[1]+dy*t],
        [a[0]+dx*(t+.08)-dy/length*depth,a[1]+dy*(t+.08)+dx/length*depth],
        [a[0]+dx*(t+.16),a[1]+dy*(t+.16)]);
    }
  });
  return result;
}
function letterPixels(ch,phase=null,index=0,cut=false,torn=true) {
  const shapes=FORMS[ch].map((polygon,p)=>(torn?tornContour(polygon,index+p):polygon).map(([a,b],i)=>{
    if(phase===null)return [a,b];
    const time=phase+index*.83+p*1.2;
    return [a+(i%3===0?.45*Math.sin(time+i*.37):0),
      b+(i%3===1?.45*Math.sin(time+i*.51):0)];
  }));
  const seam=5+(phase===null?0:.4*Math.sin(phase+index*1.1)),pixels=[];
  for(let gy=-2;gy<Math.ceil((18*sy+1)*SAMPLE);gy++)
    for(let gx=-3;gx<Math.ceil((18*sx+18*lean+1)*SAMPLE);gx++){
      const localY=(gy+.5)/SAMPLE,ly=localY/sy,lx=((gx+.5)/SAMPLE-lean*(18-ly))/sx;
      if(shapes.reduce((v,p)=>v!==inside(lx,ly,p),false)){
        // A small incision, rather than deleting a full row of the upper word.
        if(cut && localY>=seam && localY<seam+.5 && lx<7)continue;
        pixels.push([gx,gy]);
      }
    }
  return pixels;
}
// Optical kerning uses the actual contours at the authored vertical offsets.
// Keep a motion allowance so adjacent strokes cannot touch during the cycle.
function packWord(value,ys,ink,indexOffset) {
  const rightEdges=new Map(),letters=[];let first=Infinity,last=-Infinity;
  [...value].forEach((ch,i)=>{
    const pixels=letterPixels(ch,null,0,false,false),y=Math.round(ys[i]*SAMPLE),leftEdges=new Map();
    for(const [px,py] of pixels)leftEdges.set(py+y,Math.min(leftEdges.get(py+y)??Infinity,px));
    let x=0;
    if(i)for(const [row,left] of leftEdges)
      if(rightEdges.has(row))x=Math.max(x,rightEdges.get(row)-left+Math.ceil(TITLE_TYPE.gap*SAMPLE)+1);
    for(const [px,py] of pixels){
      first=Math.min(first,px+x);last=Math.max(last,px+x);
      rightEdges.set(py+y,Math.max(rightEdges.get(py+y)??-Infinity,px+x));
    }
    letters.push({ch,x,y,ink,index:indexOffset+i,cut:i%3===1});
  });
  return {letters,first,last,width:last-first+1};
}
const upper=packWord('SHUTTLE',[5,1,6,2,5,3,6],'w',0);
const lower=packWord('BLUES',[32,28,31,28,32],'b',7);
const PAD=6,WIDTH=Math.ceil((Math.max(upper.width,lower.width)+PAD*2)/2)*2,HEIGHT=112;
const LETTERS=Object.freeze([upper,lower].flatMap(word=>{
  const dx=Math.round((WIDTH-word.width)/2)-word.first;
  return word.letters.map(letter=>Object.freeze({...letter,x:letter.x+dx}));
}));
function buildRows(phase=null) {
  const grid=Array.from({length:HEIGHT},()=>Array(WIDTH).fill(' '));
  LETTERS.forEach(({ch,x,y,ink,index,cut})=>{
    const cells=letterPixels(ch,phase,index,cut),mask=new Set(cells.map(([a,b])=>a+','+b));
    for(const [a,b] of cells){
      const xx=x+a,yy=y+b;
      // Sparse lips are part of the glyph itself. There are no exterior rails or ticks.
      const edge=ink==='b'&&!mask.has(a+','+(b-1));
      if(grid[yy]&&xx>=0&&xx<WIDTH)grid[yy][xx]=edge?'w':ink;
    }
  });
  return Object.freeze(grid.map(row=>row.join('')));
}
export const TITLE_ART=Object.freeze({
  name:'SHUTTLE BLUES',width:WIDTH,height:HEIGHT,
  heightRatio:HEIGHT/WIDTH*TITLE_TYPE.cellAspect,rows:buildRows(),
});
const POSES=120,CYCLE_MS=12000,poses=new Map();
export function titleArtFrame(now=0,reducedMotion=false,art=TITLE_ART) {
  if(reducedMotion || art!==TITLE_ART)return art;
  const elapsed=Math.max(0,Number.isFinite(now)?now:0)%CYCLE_MS;
  const index=Math.floor(elapsed/CYCLE_MS*POSES);
  if(!poses.has(index))poses.set(index,Object.freeze({...TITLE_ART,rows:buildRows(index/POSES*TAU)}));
  return poses.get(index);
}
export function blockRows(ink) {
  const rows=[];
  for(let y=0;y<HEIGHT;y+=2)rows.push([...TITLE_ART.rows[y]].map((c,x)=>{
    const a=c===ink,b=TITLE_ART.rows[y+1]?.[x]===ink;
    return a?(b?'█':'▀'):(b?'▄':' ');
  }).join(''));
  return rows;
}
export function drawTitleArt(r,at,colors,{now=0,reducedMotion=true,art=TITLE_ART}={}) {
  const {width,height,rows}=titleArtFrame(now,reducedMotion,art);
  const ux=at.w/width,uy=at.h/height;
  for(let y=0;y<height;y++)for(let x=0;x<width;){
    const ink=rows[y][x];let end=x+1;
    while(end<width && rows[y][end]===ink)end++;
    if(ink!==' '){
      const x0=Math.round(at.x+x*ux),x1=Math.round(at.x+end*ux);
      const y0=Math.round(at.y+y*uy),y1=Math.round(at.y+(y+1)*uy);
      r.fill(x0,y0,x1-x0,y1-y0,colors[ink]);
    }
    x=end;
  }
}

