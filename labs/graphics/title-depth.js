// Broken Signal: a shallow fractured back edge, attached to the actual glyphs.
// Decoration only. No blur, light sweep, glyph scaling or front-face mutation.
import { TITLE_ART, titleArtFrame } from './title-art.js';
const cache=new Map(),CYCLE=24000,STEP=150;
const hash=(x,y)=>((x*73+y*157+x*y*11)>>>0)%997;
export function titleDepthFrame(now=0,reducedMotion=false,art=TITLE_ART){
  if(art!==TITLE_ART)return {segments:[],lastInkRow:0,doubleCount:0};
  const phase=reducedMotion?-1:Math.floor(Math.max(0,Number.isFinite(now)?now:0)%CYCLE/STEP);
  if(cache.has(phase))return cache.get(phase);
  const t=phase<0?0:phase*STEP,front=titleArtFrame(t,reducedMotion,art);
  const {width:W,height:H,rows}=front;
  const ink=(x,y)=>x>=0&&x<W&&y>=0&&y<H&&rows[y][x]!==' ';
  // A short, consistent lower-right offset gives volume. Local one-cell changes
  // in the broken edge are slow and staggered, rather than a blinking duplicate.
  const dx=4,dy=4,segments=[];let doubleCount=0;
  const add=(x,y,axis,length=1,role='edge')=>{
    if(x<0||y<0||x+Number(axis==='h')*length>=W||y+Number(axis==='v')*length>=H)return;
    const px=Math.min(W-1,Math.floor(x)),py=Math.min(H-1,Math.floor(y));
    if(ink(px,py))return;
    segments.push({x,y,axis,length,role});
  };
  for(let y=0;y<H-1;y++)for(let x=0;x<W-1;x++)if(ink(x,y)){
    const bottom=!ink(x,y+1),right=!ink(x+1,y);
    if(!bottom&&!right)continue;
    const h=hash(Math.floor(x/6),Math.floor(y/5));
    const age=phase<0?0:Math.floor((t+h*13)/1800);
    const broken=(x+y+age)%17<4 || (hash(x,y)+age)%29<4;
    const nick=phase<0?0:Math.round(.6*Math.sin(t/1900+h));
    const xx=x+dx,yy=y+dy;
    if(!broken){
      if(bottom)add(xx,yy+1+nick,'h');
      if(right)add(xx+1+nick,yy,'v');
    }
    // Sparse stair-step ribs attach the back contour to the front face.
    // They share the same diagonally offset depth, rather than framing the title.
    if((bottom&&right&&hash(x,y)%11===0)||(bottom&&x%13===0)||(right&&y%13===0)){
      for(let d=1;d<=dx;d++){
        if((hash(x,y)+d)%7===0)continue;
        add(x+d,y+d,'h',1,'rib');add(x+d+1,y+d,'v',1,'rib');
      }
    }
    // Only two short local echoes per 24-second loop, 0.9 seconds each.
    // Statically authored reduced-motion pose contains no temporary double lines.
    const echoWindow=phase>=0&&((t>=5100&&t<6000)||(t>=17100&&t<18000));
    const sweep=t<12000?105+(t-5100)/900*20:205+(t-17100)/900*12;
    const echoZone=x>=sweep&&x<sweep+20&&(t<12000?y<54:y>65);
    if(echoWindow&&echoZone&&!broken&&bottom){add(xx,yy+2,'h',1,'echo');doubleCount++;}
  }
  const lastInkRow=segments.reduce((n,s)=>Math.max(n,s.y+(s.axis==='v'?s.length:0)+1),0);
  const frame=Object.freeze({segments:Object.freeze(segments),lastInkRow,doubleCount});
  cache.set(phase,frame);return frame;
}
export function drawTitleDepth(r,at,colors,{now=0,reducedMotion=true,art=TITLE_ART}={}){
  const frame=titleDepthFrame(now,reducedMotion,art),ux=at.w/art.width,uy=at.h/art.height;
  for(const s of frame.segments){
    const x=Math.round(at.x+s.x*ux),y=Math.round(at.y+s.y*uy);
    const w=s.axis==='h'?Math.max(1,Math.round((s.x+s.length)*ux)-Math.round(s.x*ux)):1;
    const h=s.axis==='v'?Math.max(1,Math.round((s.y+s.length)*uy)-Math.round(s.y*uy)):1;
    r.fill(x,y,w,h,s.role==='rib'?colors.rib:colors.edge);
  }
  return frame;
}
