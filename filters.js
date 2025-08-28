// Image preprocessing filters
export function applyGaussianBlurToImageData(imageData, sigma) {
  const data = imageData.data, w=imageData.width, h=imageData.height;
  const result = new Uint8ClampedArray(data.length); const radius = Math.ceil(sigma*3);
  const kernel=[]; let sum=0; for (let i=-radius;i<=radius;i++){const v=Math.exp(-(i*i)/(2*sigma*sigma));kernel.push(v);sum+=v;} kernel.forEach((v,i)=>kernel[i]=v/s);
  const temp = new Uint8ClampedArray(data.length);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){const idx=(y*w+x)*4; if(data[idx+3]===0){temp[idx+3]=0;continue;} let sr=0,sg=0,sb=0,sa=0; for (let k=0;k<kernel.length;k++){const nx=Math.max(0,Math.min(w-1,x+k-radius)); const ni=(y*w+nx)*4; if(data[ni+3]>0){sr+=data[ni]*kernel[k]; sg+=data[ni+1]*kernel[k]; sb+=data[ni+2]*kernel[k]; sa+=data[ni+3]*kernel[k];}} temp[idx]=sr|0; temp[idx+1]=sg|0; temp[idx+2]=sb|0; temp[idx+3]=sa|0; }
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){const idx=(y*w+x)*4; if(temp[idx+3]===0){result[idx+3]=0;continue;} let sr=0,sg=0,sb=0,sa=0; for (let k=0;k<kernel.length;k++){const ny=Math.max(0,Math.min(h-1,y+k-radius)); const ni=(ny*w+x)*4; if(temp[ni+3]>0){sr+=temp[ni]*kernel[k]; sg+=temp[ni+1]*kernel[k]; sb+=temp[ni+2]*kernel[k]; sa+=temp[ni+3]*kernel[k];}} result[idx]=sr|0; result[idx+1]=sg|0; result[idx+2]=sb|0; result[idx+3]=sa|0; }
  return new ImageData(result,w,h);
}

export function applyMedianFilter(imageData, radius=2){
  const {data,width:w,height:h}=imageData; const out=new Uint8ClampedArray(data.length);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){const i=(y*w+x)*4; if(data[i+3]===0){out[i+3]=0;continue;} const rs=[],gs=[],bs=[]; for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++){const nx=x+dx, ny=y+dy; if(nx>=0&&nx<w&&ny>=0&&ny<h){const ni=(ny*w+nx)*4; if(data[ni+3]>0){rs.push(data[ni]);gs.push(data[ni+1]);bs.push(data[ni+2]);}}} rs.sort((a,b)=>a-b); gs.sort((a,b)=>a-b); bs.sort((a,b)=>a-b); const m=Math.floor(rs.length/2); out[i]=rs[m]; out[i+1]=gs[m]; out[i+2]=bs[m]; out[i+3]=data[i+3]; }
  return new ImageData(out,w,h);
}

export function applyBilateralFilter(imageData, sigmaColor=25, sigmaSpace=7){
  const {data,width:w,height:h}=imageData; const result=new Uint8ClampedArray(data.length); const radius=Math.ceil(sigmaSpace*2);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){const i=(y*w+x)*4; if(data[i+3]===0){result[i+3]=0;continue;} let tw=0,sr=0,sg=0,sb=0; const cr=data[i],cg=data[i+1],cb=data[i+2]; for(let dy=-radius;dy<=radius;dy++) for(let dx=-radius;dx<=radius;dx++){const nx=x+dx, ny=y+dy; if(nx>=0&&nx<w&&ny>=0&&ny<h){const ni=(ny*w+nx)*4; if(data[ni+3]>0){const dr=cr-data[ni], dg=cg-data[ni+1], db=cb-data[ni+2]; const colorDist=Math.sqrt(dr*dr+dg*dg+db*db); const spatial=Math.sqrt(dx*dx+dy*dy); const wColor=Math.exp(-(colorDist*colorDist)/(2*sigmaColor*sigmaColor)); const wSpace=Math.exp(-(spatial*spatial)/(2*sigmaSpace*sigmaSpace)); const weight=wColor*wSpace; tw+=weight; sr+=data[ni]*weight; sg+=data[ni+1]*weight; sb+=data[ni+2]*weight; }}} result[i]=Math.round(sr/tw); result[i+1]=Math.round(sg/tw); result[i+2]=Math.round(sb/tw); result[i+3]=data[i+3]; }
  return new ImageData(result,w,h);
}
