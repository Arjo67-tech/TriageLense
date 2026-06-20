/**
 * Decode any browser-recorded audio blob (WebM/Opus, etc.) to a 16-bit
 * mono WAV via AudioContext. soundfile on the server can always read WAV.
 */
export async function blobToWav(blob: Blob): Promise<Blob> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuf);
  await ctx.close();

  // Mix down to mono at original sample rate
  const sr = decoded.sampleRate;
  const numCh = decoded.numberOfChannels;
  const len = decoded.length;
  const mono = new Float32Array(len);
  for (let ch = 0; ch < numCh; ch++) {
    const chData = decoded.getChannelData(ch);
    for (let i = 0; i < len; i++) mono[i] += chData[i] / numCh;
  }

  // Encode as 16-bit PCM WAV
  const pcm = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const wavBuf = new ArrayBuffer(44 + pcm.byteLength);
  const v = new DataView(wavBuf);
  const write = (off: number, val: number, bytes: number) => {
    for (let i = 0; i < bytes; i++) v.setUint8(off + i, (val >> (i * 8)) & 0xff);
  };
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };

  writeStr(0,  "RIFF");
  write(4,     36 + pcm.byteLength, 4);
  writeStr(8,  "WAVE");
  writeStr(12, "fmt ");
  write(16, 16, 4);       // PCM chunk size
  write(20, 1,  2);       // PCM format
  write(22, 1,  2);       // mono
  write(24, sr, 4);       // sample rate
  write(28, sr * 2, 4);   // byte rate
  write(32, 2,  2);       // block align
  write(34, 16, 2);       // bits per sample
  writeStr(36, "data");
  write(40, pcm.byteLength, 4);
  new Int16Array(wavBuf, 44).set(pcm);

  return new Blob([wavBuf], { type: "audio/wav" });
}
