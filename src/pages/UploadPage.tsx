import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, CircleAlert, CloudUpload, FileCheck2, FileImage, LoaderCircle, RefreshCw, ScanLine, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { extractStudentDetails, saveStudent } from "../services/studentScanner";
import "../UploadPage.css";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    const video = videoRef.current;
    if (cameraOpen && video && cameraStream) {
      video.srcObject = cameraStream;
      void video.play().catch(() => setCameraError("We couldn’t start the camera preview. Check camera permissions."));
    }
  }, [cameraOpen, cameraError, cameraStream]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const setSelectedFile = (selected?: File) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setStatus("Choose a JPG, PNG, or another image file.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setStatus("This image is larger than 10 MB. Choose a smaller file.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setStatus("");
    setSuccess(false);
  };

  const openCamera = async () => {
    setCameraError("");
    setCameraOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not available in this browser.");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      setCameraStream(stream);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Allow camera access and try again.");
    }
  };

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraStream(null);
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
    setCameraError("");
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setCameraError("Wait for the camera image to appear, then capture again.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return setCameraError("This browser could not capture the image.");
    context.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return setCameraError("The photo could not be saved. Please try again.");
      setSelectedFile(new File([blob], "student-certificate.jpg", { type: "image/jpeg" }));
      closeCamera();
    }, "image/jpeg", 0.96);
  };

  const processCertificate = async () => {
    if (!file) return;
    setBusy(true);
    setStatus("Reading the certificate and preparing the student record…");
    setSuccess(false);
    try {
      const student = await extractStudentDetails(file);
      await saveStudent(student);
      setSuccess(true);
      setStatus("Student record saved successfully.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "We couldn’t process this certificate. Try another image.");
    } finally {
      setBusy(false);
    }
  };

  const removeFile = () => {
    setFile(null);
    setPreview("");
    setStatus("");
    setSuccess(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <main className="upload-page">
      <div className="upload-content">
        <div className="upload-breadcrumb"><span>STUDENT RECORDS</span><span className="breadcrumb-slash">/</span><strong>DOCUMENT INTAKE</strong></div>
        <section className="upload-hero">
          <div className="upload-hero-copy"><span className="upload-eyebrow"><Sparkles size={14} /> SMART DOCUMENT INTAKE</span><h1>Turn certificates into<br /><em>clean records.</em></h1><p>Capture or upload a student certificate. We’ll read the details and prepare the record for you.</p></div>
          <div className="hero-art" aria-hidden="true"><div className="hero-orbit hero-orbit-a"/><div className="hero-orbit hero-orbit-b"/><div className="hero-document"><div className="hero-doc-logo"><BadgeCheck size={20}/></div><i/><i/><i/><div className="hero-doc-stamp"><Check size={18}/></div></div><div className="hero-spark hero-spark-a">✳</div><div className="hero-spark hero-spark-b">✦</div></div>
        </section>

        <div className="upload-section-heading"><div><span className="upload-step">01</span><div><h2>{cameraOpen ? "Capture a certificate" : file ? "Review your document" : "Add a student certificate"}</h2><p>{cameraOpen ? "Keep the full page inside the frame." : file ? "Make sure all text is clear and easy to read." : "Choose a clear image of the certificate to get started."}</p></div></div><span className="upload-accepted"><ShieldCheck size={15}/> Private & secure</span></div>

        {cameraOpen ? (
          <section className="camera-panel">
            <div className="camera-view">
              {!cameraError ? <><video ref={videoRef} autoPlay playsInline muted/><div className="camera-guide"><i/><i/><i/><i/></div></> : <div className="camera-message"><Camera size={28}/><strong>Camera unavailable</strong><span>{cameraError}</span><button onClick={() => void openCamera()}><RefreshCw size={15}/> Try again</button></div>}
              {!cameraError && <span className="camera-live"><i/> CAMERA READY</span>}
            </div>
            <div className="camera-actions"><button className="secondary-action" onClick={closeCamera}><X size={16}/> Cancel</button><button className="primary-action" onClick={capturePhoto} disabled={!!cameraError}><Camera size={17}/> Take photo</button></div>
          </section>
        ) : file ? (
          <section className="document-review">
            <div className="review-preview">{preview && <img src={preview} alt="Selected student certificate"/>}<span className="image-badge"><FileImage size={14}/> IMAGE PREVIEW</span></div>
            <div className="review-details"><div className="file-summary"><span className="file-icon"><FileCheck2 size={20}/></span><div><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to scan</small></div><button className="icon-action" aria-label="Remove image" onClick={removeFile}><X size={17}/></button></div>
              <div className="review-tip"><Sparkles size={16}/><span><strong>For best results</strong> Use a well-lit photo with all four edges visible.</span></div>
              {status && <div className={`scan-status ${success ? "is-success" : busy ? "is-busy" : "is-error"}`} role={success ? "status" : "alert"}>{success ? <Check size={17}/> : busy ? <LoaderCircle className="spin-icon" size={17}/> : <CircleAlert size={17}/>}<span>{status}</span></div>}
              <div className="review-actions"><button className="secondary-action" onClick={removeFile} disabled={busy}><ArrowLeft size={16}/> Choose another</button><button className="primary-action" onClick={() => void processCertificate()} disabled={busy || success}>{busy ? <><LoaderCircle className="spin-icon" size={17}/> Reading details…</> : success ? <><Check size={17}/> Record saved</> : <><ScanLine size={17}/> Read certificate<ArrowRight size={16}/></>}</button></div>
              {success && <button className="scan-another" onClick={removeFile}>Scan another certificate</button>}
            </div>
          </section>
        ) : (
          <section className={`upload-workspace ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setSelectedFile(event.dataTransfer.files[0]); }}>
            <div className="dropzone" role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click(); } }}>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={(event) => setSelectedFile(event.target.files?.[0])}/>
              <span className="dropzone-icon"><CloudUpload size={25}/></span><h3>Drop your certificate here</h3><p>or browse files on your device</p><span className="browse-button"><Upload size={15}/> Choose an image</span><small>JPG, PNG, or WEBP · up to 10 MB</small>
              {status && <span className="upload-inline-error" role="alert">{status}</span>}
            </div>
            <div className="upload-alternative" role="button" tabIndex={0} aria-label="Open camera to take a certificate photo" onClick={() => void openCamera()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openCamera(); } }}><span className="alternative-label">OR</span><div className="alternative-icon"><Camera size={20}/></div><h3>Use your camera</h3><p>Take a photo of the full certificate page.</p><span className="camera-action">Open camera<ArrowRight size={15}/></span><div className="alternative-note"><ShieldCheck size={14}/> Your files stay private</div></div>
          </section>
        )}

        {!cameraOpen && !file && <section className="upload-steps"><div className="upload-steps-title"><span>HOW IT WORKS</span><span>Three simple steps</span></div><div className="step-cards"><article><span><CloudUpload size={18}/></span><b>01</b><strong>Add a certificate</strong><small>Upload an image or take a photo.</small></article><article><span><ScanLine size={18}/></span><b>02</b><strong>Review the details</strong><small>Our scanner reads the printed text.</small></article><article><span><Check size={18}/></span><b>03</b><strong>Save the student record</strong><small>Send the extracted details to your records.</small></article></div></section>}
        <footer className="upload-footer"><span><ShieldCheck size={15}/> Student documents are handled securely</span><span>EDUTRIO ERP <i/> DOCUMENT INTAKE</span></footer>
      </div>
    </main>
  );
}
