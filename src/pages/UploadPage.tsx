import { useEffect, useRef, useState } from "react";
import { ArrowRight, BadgeCheck, Camera, Check, CircleAlert, CloudUpload, LoaderCircle, RefreshCw, ScanLine, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { ACADEMIC_CATEGORIES, DOCUMENT_CATEGORIES, saveCertificate, type DocumentCategory } from "../services/certificateRecords";
import { calculateAcademicSummary, extractStudentDetails, type ExtractedStudent } from "../services/studentScanner";
import { UploadFlowError, safeUploadErrorDetails } from "../services/uploadErrors";
import { getAutomaticExtractionError } from "../services/academicSavePayload";
import { canConfirmCertificatePreview, createSubmissionGuard, getSupportedCertificateMimeType } from "../services/certificatePreview";
import "../UploadPage.css";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [status, setStatus] = useState("");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>(DOCUMENT_CATEGORIES[0][0]);
  const [extraction, setExtraction] = useState<ExtractedStudent | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const submissionGuard = useRef(createSubmissionGuard());

  useEffect(() => {
    const video = videoRef.current;
    if (cameraOpen && video && cameraStream) {
      video.srcObject = cameraStream;
      void video.play().catch(() => setCameraError("We couldn’t start the camera preview. Check camera permissions."));
    }
  }, [cameraOpen, cameraError, cameraStream]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  async function processCertificate(selectedFile: File, selectedCategory: DocumentCategory) {
    if (!submissionGuard.current.acquire()) return;
    setBusy(true);
    setStatus("Processing certificate...");
    setSuccess(false);
    setRetryAvailable(false);
    try {
      const student = await extractStudentDetails(selectedFile);
      const isAcademic = ACADEMIC_CATEGORIES.has(selectedCategory);
      setExtraction(student);
      const extractionError = getAutomaticExtractionError(student, isAcademic);
      if (extractionError) {
        if (import.meta.env.DEV) {
          const summary = isAcademic ? calculateAcademicSummary(student.subjectMarks, student.officialTotalMarks) : null;
          console.warn("[certificate-upload] OCR validation stopped before saving", {
            category: selectedCategory,
            studentNameConfident: student.studentName.trim().length > 0 && student.studentNameConfidence >= 80,
            subjectRowCount: student.subjectMarks.length,
            uncertainSubjectRowCount: student.subjectMarks.filter((subject) => subject.needsReview).length,
            totalCalculated: summary?.totalMarks !== null && summary?.totalMarks !== undefined,
            maximumCalculated: summary?.maximumTotalMarks !== null && summary?.maximumTotalMarks !== undefined,
            printedTotalMismatch: summary?.totalMismatch === true,
            printedPercentageMismatch: summary !== null && student.officialPercentage !== null && summary.percentage !== null
              ? Math.abs(summary.percentage - student.officialPercentage) > 0.05
              : false,
            printedMaximumMismatch: summary !== null && student.officialMaximumTotalMarks !== null && summary.maximumTotalMarks !== null
              ? Math.abs(summary.maximumTotalMarks - student.officialMaximumTotalMarks) > 0.01
              : false,
          });
        }
        setRetryAvailable(true);
        setStatus("Unable to process certificate. Please upload a clearer image.");
        return;
      }
      await saveCertificate(selectedFile, student, selectedCategory, "insert", (stage) => {
        setStatus(stage === "storage" ? "Processing certificate..." : "Saving certificate...");
      });
      setSuccess(true);
      setStatus("Record saved successfully!");
    } catch (error) {
      if (import.meta.env.DEV) {
        const stage = error instanceof UploadFlowError ? error.stage : "unknown";
        console.error("[certificate-upload] Upload failed", {
          stage,
          ...safeUploadErrorDetails(error),
          category: selectedCategory,
          imageType: selectedFile.type || "unknown",
          imageSizeBytes: selectedFile.size,
        });
      }
      setRetryAvailable(true);
      const stage = error instanceof UploadFlowError ? error.stage : "unknown";
      setStatus(stage === "image_decode" || stage === "ocr_initialization" || stage === "ocr_recognition"
        ? "Unable to process certificate. Please upload a clearer image."
        : "Unable to save certificate. Please try again.");
    } finally {
      submissionGuard.current.release();
      setBusy(false);
    }
  }

  const setSelectedFile = (selected?: File) => {
    if (!selected || busy) return;
    const normalizedMimeType = getSupportedCertificateMimeType(selected);
    if (!normalizedMimeType) {
      setStatus("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setStatus("This image is larger than 10 MB. Choose a smaller file.");
      return;
    }
    const imageFile = selected.type === normalizedMimeType
      ? selected
      : new File([selected], selected.name, { type: normalizedMimeType, lastModified: selected.lastModified });
    let nextPreviewUrl: string;
    try {
      nextPreviewUrl = URL.createObjectURL(imageFile);
    } catch {
      setStatus("Unable to display this certificate. Please choose another image.");
      return;
    }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = nextPreviewUrl;
    setPreviewUrl(nextPreviewUrl);
    setPreviewReady(false);
    setPreviewFailed(false);
    setFile(imageFile);
    setExtraction(null);
    setStatus("");
    setSuccess(false);
    setRetryAvailable(false);
  };

  const confirmCertificate = () => {
    if (!file || !canConfirmCertificatePreview(!!file, previewReady, previewFailed, busy)) return;
    void processCertificate(file, documentCategory);
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

  const removeFile = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl("");
    setPreviewReady(false);
    setPreviewFailed(false);
    setFile(null);
    setExtraction(null);
    setStatus("");
    setSuccess(false);
    setRetryAvailable(false);
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

        <div className="upload-section-heading"><div><span className="upload-step">01</span><div><h2>{cameraOpen ? "Capture a certificate" : file ? busy ? "Processing certificate" : "Confirm certificate" : "Add a student certificate"}</h2><p>{cameraOpen ? "Keep the full page inside the frame." : file ? busy ? "OCR and secure saving are in progress." : "Check the image preview, then select OK to continue." : "Choose a clear image of the certificate to get started."}</p></div></div><span className="upload-accepted"><ShieldCheck size={15}/> Private & secure</span></div>

        <label className="document-category-field">Document type<select value={documentCategory} disabled={!!extraction || busy} onChange={(event) => { const category = event.target.value as DocumentCategory; setDocumentCategory(category); setExtraction(null); }}>{DOCUMENT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

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
            <div className="review-preview">
              {previewUrl && !previewFailed && <img src={previewUrl} alt="Selected certificate preview" onLoad={() => setPreviewReady(true)} onError={() => { setPreviewReady(false); setPreviewFailed(true); setRetryAvailable(false); setStatus("Unable to display this certificate. Please choose another image."); }}/>}
              {previewFailed && <p className="preview-error" role="alert">Unable to display this certificate. Please choose another image.</p>}
              {previewReady && !previewFailed && !busy && !success && !retryAvailable && <button className="primary-action preview-confirm" onClick={confirmCertificate}>OK</button>}
            </div>
            <div className="review-details">
              {status && <div className={`scan-status ${success ? "is-success" : busy ? "is-busy" : "is-error"}`} role={success || busy ? "status" : "alert"}>{success ? <Check size={17}/> : busy ? <LoaderCircle className="spin-icon" size={17}/> : <CircleAlert size={17}/>}<span>{status}</span></div>}
              <div className="review-actions"><button className="secondary-action" onClick={removeFile} disabled={busy}>Choose another</button>{busy ? <button className="primary-action" disabled><LoaderCircle className="spin-icon" size={17}/> Processing…</button> : success ? <button className="primary-action" disabled><Check size={17}/> Saved</button> : retryAvailable ? <button className="primary-action" onClick={() => void processCertificate(file, documentCategory)}><RefreshCw size={16}/> Retry</button> : null}</div>
              {success && <button className="scan-another" onClick={removeFile}>Scan another certificate</button>}
            </div>
          </section>
        ) : (
          <section className={`upload-workspace ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setSelectedFile(event.dataTransfer.files[0]); }}>
            <div className="dropzone" role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click(); } }}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setSelectedFile(event.target.files?.[0])}/>
              <span className="dropzone-icon"><CloudUpload size={25}/></span><h3>Drop your certificate here</h3><p>or browse files on your device</p><span className="browse-button"><Upload size={15}/> Choose an image</span><small>JPG, PNG, or WEBP · up to 10 MB</small>
              {status && <span className="upload-inline-error" role="alert">{status}</span>}
            </div>
            <div className="upload-alternative" role="button" tabIndex={0} aria-label="Open camera to take a certificate photo" onClick={() => void openCamera()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openCamera(); } }}><span className="alternative-label">OR</span><div className="alternative-icon"><Camera size={20}/></div><h3>Use your camera</h3><p>Take a photo of the full certificate page.</p><span className="camera-action">Open camera<ArrowRight size={15}/></span><div className="alternative-note"><ShieldCheck size={14}/> Your files stay private</div></div>
          </section>
        )}

        {!cameraOpen && !file && <section className="upload-steps"><div className="upload-steps-title"><span>HOW IT WORKS</span><span>Three simple steps</span></div><div className="step-cards"><article><span><CloudUpload size={18}/></span><b>01</b><strong>Add a certificate</strong><small>Upload an image or take a photo.</small></article><article><span><ScanLine size={18}/></span><b>02</b><strong>Read certificate</strong><small>Details are processed automatically.</small></article><article><span><Check size={18}/></span><b>03</b><strong>Save the record</strong><small>Validated details are sent to your records.</small></article></div></section>}
        <footer className="upload-footer"><span><ShieldCheck size={15}/> Student documents are handled securely</span><span>EDUTRIO ERP <i/> DOCUMENT INTAKE</span></footer>
      </div>
    </main>
  );
}
