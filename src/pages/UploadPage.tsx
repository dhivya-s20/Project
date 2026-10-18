import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, CircleAlert, CloudUpload, FileCheck2, FileImage, LoaderCircle, RefreshCw, ScanLine, ShieldCheck, Sparkles, Upload, X } from "lucide-react";
import { ACADEMIC_CATEGORIES, DOCUMENT_CATEGORIES, saveCertificate, type DocumentCategory } from "../services/certificateRecords";
import { calculateAcademicSummary, extractStudentDetails, type ExtractedStudent, type SubjectMark } from "../services/studentScanner";
import { UploadFlowError, safeUploadErrorDetails, uploadFailureMessage } from "../services/uploadErrors";
import "../UploadPage.css";

function needsAcademicReview(student: ExtractedStudent) {
  const summary = calculateAcademicSummary(student.subjectMarks, student.officialTotalMarks);
  return !student.studentName.trim()
    || student.reviewFields.length > 0
    || student.subjectMarks.some((subject) => subject.needsReview)
    || summary.totalMarks === null
    || summary.maximumTotalMarks === null
    || summary.totalMismatch === true
    || (summary.percentage !== null && student.officialPercentage !== null && Math.abs(summary.percentage - student.officialPercentage) > 0.05)
    || (summary.maximumTotalMarks !== null && student.officialMaximumTotalMarks !== null && Math.abs(summary.maximumTotalMarks - student.officialMaximumTotalMarks) > 0.01);
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [status, setStatus] = useState("");
  const [documentCategory, setDocumentCategory] = useState<DocumentCategory>(DOCUMENT_CATEGORIES[0][0]);
  const [extraction, setExtraction] = useState<ExtractedStudent | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submissionLock = useRef(false);

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
    if (!(selected.type === "image/jpeg" || selected.type === "image/png" || selected.type === "image/webp")) {
      setStatus("Choose a JPG, PNG, or WEBP image.");
      return;
    }
    if (selected.size > 10 * 1024 * 1024) {
      setStatus("This image is larger than 10 MB. Choose a smaller file.");
      return;
    }
    try {
      const nextPreview = URL.createObjectURL(selected);
      setFile(selected);
      setPreview(nextPreview);
      setExtraction(null);
      setShowReview(false);
      setSavedRecordId(null);
      setStatus("");
      setSuccess(false);
    } catch {
      setStatus("This image could not be prepared for preview. Try another JPG, PNG, or WEBP file.");
    }
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
    if (!file || submissionLock.current) return;
    submissionLock.current = true;
    setBusy(true);
    setStatus("Reading the certificate and preparing the student record…");
    setSuccess(false);
    try {
      const student = await extractStudentDetails(file);
      const isAcademic = ACADEMIC_CATEGORIES.has(documentCategory);
      if (isAcademic) {
        setExtraction(student);
        setShowReview(false);
      }
      setStatus("Uploading the certificate securely…");
      const result = await saveCertificate(file, student, documentCategory);
      setSavedRecordId(result.id);
      setSuccess(true);
      const reviewNotice = isAcademic && needsAcademicReview(student)
        ? " Some extracted fields need review; the uncertain values were flagged in your record."
        : "";
      setStatus(result.inserted ? `Record Saved Successfully.${reviewNotice}` : `This certificate record was already saved.${reviewNotice}`);
    } catch (error) {
      if (import.meta.env.DEV) {
        const stage = error instanceof UploadFlowError ? error.stage : "unknown";
        console.error("[certificate-upload] Upload failed", {
          stage,
          ...safeUploadErrorDetails(error),
          category: documentCategory,
          imageType: file.type || "unknown",
          imageSizeBytes: file.size,
        });
      }
      setStatus(uploadFailureMessage(error));
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  };

  const saveReviewedCertificate = async () => {
    if (!file || !extraction || !savedRecordId || submissionLock.current) return;
    if (extraction.subjectMarks.some((subject) => !subject.subjectName.trim())) {
      setStatus("Enter a subject name or remove the empty subject row before saving.");
      return;
    }
    if (extraction.subjectMarks.some((subject) => subject.marksObtained !== null && subject.maximumMarks !== null && subject.marksObtained > subject.maximumMarks)) {
      setStatus("A subject’s obtained marks exceed its maximum. Correct that row before saving.");
      return;
    }
    if (extraction.subjectMarks.some((subject) => [subject.maximumMarks, subject.theoryMaximumMarks, subject.practicalMaximumMarks].some((maximum) => maximum !== null && maximum <= 0))) {
      setStatus("Maximum marks must be greater than zero. Correct that subject row before saving.");
      return;
    }
    if (extraction.officialPercentage !== null && (extraction.officialPercentage < 0 || extraction.officialPercentage > 100)) {
      setStatus("The printed percentage must be between 0 and 100.");
      return;
    }
    if (extraction.dateOfBirth && !isValidBirthDate(extraction.dateOfBirth)) {
      setStatus("Enter the date of birth as a valid DD/MM/YYYY date.");
      return;
    }
    submissionLock.current = true;
    setBusy(true);
    setSuccess(false);
    setStatus("Saving your reviewed corrections securely…");
    try {
      const result = await saveCertificate(file, extraction, documentCategory, "update");
      if (result.id !== savedRecordId) throw new UploadFlowError("certificate_record", "Supabase did not confirm the corrected certificate record.");
      setSuccess(true);
      setShowReview(false);
      setStatus("Record Saved Successfully. Your reviewed corrections were saved.");
    } catch (error) {
      if (import.meta.env.DEV) {
        const stage = error instanceof UploadFlowError ? error.stage : "unknown";
        console.error("[certificate-upload] Upload failed", {
          stage,
          ...safeUploadErrorDetails(error),
          category: documentCategory,
          imageType: file.type || "unknown",
          imageSizeBytes: file.size,
        });
      }
      setStatus(uploadFailureMessage(error));
    } finally {
      submissionLock.current = false;
      setBusy(false);
    }
  };

  const updateStudentName = (value: string) => setExtraction((current) => current ? {
    ...current,
    studentName: value,
    studentNameConfidence: value.trim() ? 100 : 0,
    reviewFields: value.trim()
      ? current.reviewFields.filter((field) => field !== "student_name")
      : [...new Set([...current.reviewFields, "student_name"])],
  } : current);

  const updateAcademicFields = (changes: Partial<ExtractedStudent>) => setExtraction((current) => {
    if (!current) return current;
    const reviewFields = new Set(current.reviewFields);
    if ("registerNumber" in changes && changes.registerNumber?.trim()) reviewFields.delete("register_number");
    if ("dateOfBirth" in changes && changes.dateOfBirth?.trim()) reviewFields.delete("date_of_birth");
    if ("examYear" in changes && changes.examYear !== null) reviewFields.delete("exam_year");
    if ("officialTotalMarks" in changes) reviewFields.delete("official_total_comparison");
    return { ...current, ...changes, reviewFields: [...reviewFields] };
  });

  const updateSubject = (index: number, changes: Partial<SubjectMark>) => setExtraction((current) => {
    if (!current) return current;
    const subjectMarks = current.subjectMarks.map((subject, rowIndex) => {
      if (rowIndex !== index) return subject;
      const updated = { ...subject, ...changes };
      if (["theoryMarks", "theoryMaximumMarks", "practicalMarks", "practicalMaximumMarks"].some((field) => field in changes)) {
        const components = [
          { marks: updated.theoryMarks, maximum: updated.theoryMaximumMarks },
          { marks: updated.practicalMarks, maximum: updated.practicalMaximumMarks },
        ].filter((part) => part.marks !== null || part.maximum !== null);
        if (components.length) {
          updated.marksObtained = components.every((part) => part.marks !== null)
            ? components.reduce((sum, part) => sum + (part.marks ?? 0), 0)
            : null;
          updated.maximumMarks = components.every((part) => part.maximum !== null)
            ? components.reduce((sum, part) => sum + (part.maximum ?? 0), 0)
            : null;
          updated.resultStatus = "numeric";
        }
      }
      return updated;
    });
    return { ...current, subjectMarks };
  });

  const addSubject = () => setExtraction((current) => current ? {
    ...current,
    subjectMarks: [...current.subjectMarks, {
      subjectName: "", marksObtained: null, maximumMarks: null, theoryMarks: null,
      theoryMaximumMarks: null, practicalMarks: null, practicalMaximumMarks: null,
      resultStatus: "unreadable", gradeValue: "", rawMarks: "", isOptional: false,
      confidence: 0, needsReview: true,
    }],
  } : current);

  const removeSubject = (index: number) => setExtraction((current) => current ? {
    ...current,
    subjectMarks: current.subjectMarks.filter((_, rowIndex) => rowIndex !== index),
  } : current);

  const removeFile = () => {
    setFile(null);
    setPreview("");
    setExtraction(null);
    setShowReview(false);
    setSavedRecordId(null);
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

        <label className="document-category-field">Document type<select value={documentCategory} disabled={!!extraction || busy} onChange={(event) => { setDocumentCategory(event.target.value as DocumentCategory); setExtraction(null); }}>{DOCUMENT_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>

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
              {extraction && showReview && ACADEMIC_CATEGORIES.has(documentCategory) && <AcademicReview extraction={extraction} onNameChange={updateStudentName} onFieldsChange={updateAcademicFields} onSubjectChange={updateSubject} onAddSubject={addSubject} onRemoveSubject={removeSubject} />}
              {status && <div className={`scan-status ${success ? "is-success" : busy ? "is-busy" : "is-error"}`} role={success || busy ? "status" : "alert"}>{success ? <Check size={17}/> : busy ? <LoaderCircle className="spin-icon" size={17}/> : <CircleAlert size={17}/>}<span>{status}</span></div>}
              <div className="review-actions"><button className="secondary-action" onClick={removeFile} disabled={busy}><ArrowLeft size={16}/> Choose another</button><button className="primary-action" onClick={() => void processCertificate()} disabled={busy || success}>{busy ? <><LoaderCircle className="spin-icon" size={17}/> Processing certificate…</> : success ? <><Check size={17}/> Record saved</> : <><ScanLine size={17}/> Upload and save certificate<ArrowRight size={16}/></>}</button></div>
              {success && savedRecordId && extraction && ACADEMIC_CATEGORIES.has(documentCategory) && needsAcademicReview(extraction) && <div className="review-actions"><button className="secondary-action" onClick={() => setShowReview((open) => !open)}>{showReview ? "Close details" : "Review extracted details"}</button>{showReview && <button className="primary-action" onClick={() => void saveReviewedCertificate()} disabled={busy}>{busy ? <><LoaderCircle className="spin-icon" size={17}/> Saving corrections…</> : "Save corrections"}</button>}</div>}
              {success && <button className="scan-another" onClick={removeFile}>Scan another certificate</button>}
            </div>
          </section>
        ) : (
          <section className={`upload-workspace ${dragging ? "is-dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setSelectedFile(event.dataTransfer.files[0]); }}>
            <div className="dropzone" role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInputRef.current?.click(); } }}>
              <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" onChange={(event) => setSelectedFile(event.target.files?.[0])}/>
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

type AcademicReviewProps = {
  extraction: ExtractedStudent;
  onNameChange: (value: string) => void;
  onFieldsChange: (changes: Partial<ExtractedStudent>) => void;
  onSubjectChange: (index: number, changes: Partial<SubjectMark>) => void;
  onAddSubject: () => void;
  onRemoveSubject: (index: number) => void;
};

function numberValue(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function isValidBirthDate(value: string) {
  const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function AcademicReview({ extraction, onNameChange, onFieldsChange, onSubjectChange, onAddSubject, onRemoveSubject }: AcademicReviewProps) {
  const summary = calculateAcademicSummary(extraction.subjectMarks, extraction.officialTotalMarks);
  const markInput = (label: string, value: number | null, onChange: (value: number | null) => void) => (
    <label className="academic-mark-field">{label}<input type="number" min="0" step="0.01" value={value ?? ""} onChange={(event) => onChange(numberValue(event.target.value))}/></label>
  );

  return <section className="academic-review" aria-label="Review extracted academic details">
    <div className="academic-review-heading"><div><strong>Review extracted details</strong><span>Check the OCR values and correct anything unclear before saving.</span></div><small>OCR confidence {Math.round(extraction.ocrConfidence)}%</small></div>
    {(extraction.reviewFields.length > 0 || extraction.subjectMarks.some((subject) => subject.needsReview)) && <p className="academic-review-warning" role="status">Some values need your review. Unconfirmed fields will remain marked for review in the database.</p>}
    <div className="academic-student-fields">
      <label>Student name<input value={extraction.studentName} onChange={(event) => onNameChange(event.target.value)} placeholder="Review or enter the printed name"/></label>
      <label>Register / roll number<input value={extraction.registerNumber} onChange={(event) => onFieldsChange({ registerNumber: event.target.value })} placeholder="Not read"/></label>
      <label>Date of birth<input value={extraction.dateOfBirth} onChange={(event) => onFieldsChange({ dateOfBirth: event.target.value })} placeholder="DD/MM/YYYY"/></label>
      <label>Examination year<input type="number" min="1900" max="2200" value={extraction.examYear ?? ""} onChange={(event) => onFieldsChange({ examYear: numberValue(event.target.value) })} placeholder="Not read"/></label>
      <label>Exam session<input value={extraction.examSession} onChange={(event) => onFieldsChange({ examSession: event.target.value })} placeholder="Not read"/></label>
      <label>Board name<input value={extraction.boardName} onChange={(event) => onFieldsChange({ boardName: event.target.value })} placeholder="Not read"/></label>
      <label>School / institution<input value={extraction.institutionName} onChange={(event) => onFieldsChange({ institutionName: event.target.value })} placeholder="Not read"/></label>
    </div>
    <div className="academic-subject-heading"><strong>Subject-wise marks</strong><button type="button" className="secondary-action" onClick={onAddSubject}>Add subject</button></div>
    {extraction.subjectMarks.length === 0 && <p className="academic-review-warning">No subject rows were confidently detected. Add rows from the certificate before saving.</p>}
    <div className="academic-subject-list">
      {extraction.subjectMarks.map((subject, index) => <article className="academic-subject-row" key={`${index}-${subject.subjectName}`}>
        <div className="academic-subject-main">
          <label>Subject<input value={subject.subjectName} onChange={(event) => onSubjectChange(index, { subjectName: event.target.value })} placeholder="Printed subject name"/></label>
          {markInput("Marks obtained", subject.marksObtained, (value) => onSubjectChange(index, { marksObtained: value, resultStatus: value === null ? "unreadable" : "numeric" }))}
          {markInput("Maximum marks", subject.maximumMarks, (value) => onSubjectChange(index, { maximumMarks: value }))}
          <label className="academic-mark-field">Result type<select value={subject.resultStatus} onChange={(event) => { const resultStatus = event.target.value as SubjectMark["resultStatus"]; onSubjectChange(index, { resultStatus, marksObtained: resultStatus === "absent" ? 0 : resultStatus === "numeric" ? subject.marksObtained : null, gradeValue: resultStatus === "grade" ? subject.gradeValue : "" }); }}><option value="numeric">Numeric</option><option value="absent">Absent</option><option value="grade">Grade</option><option value="unreadable">Unreadable</option></select></label>
          {subject.resultStatus === "grade" && <label className="academic-mark-field">Grade<input value={subject.gradeValue} onChange={(event) => onSubjectChange(index, { gradeValue: event.target.value })}/></label>}
          <label className="academic-optional"><input type="checkbox" checked={subject.isOptional} onChange={(event) => onSubjectChange(index, { isOptional: event.target.checked })}/> Optional subject</label>
        </div>
        <div className="academic-subject-components">
          <span>Theory and practical marks, when printed separately</span>
          {markInput("Theory", subject.theoryMarks, (value) => onSubjectChange(index, { theoryMarks: value }))}
          {markInput("Theory max", subject.theoryMaximumMarks, (value) => onSubjectChange(index, { theoryMaximumMarks: value }))}
          {markInput("Practical", subject.practicalMarks, (value) => onSubjectChange(index, { practicalMarks: value }))}
          {markInput("Practical max", subject.practicalMaximumMarks, (value) => onSubjectChange(index, { practicalMaximumMarks: value }))}
        </div>
        {subject.rawMarks && <small className="academic-ocr-fragment">OCR mark text for checking: {subject.rawMarks}</small>}
        <div className="academic-subject-footer">
          <label><input type="checkbox" checked={!subject.needsReview} onChange={(event) => onSubjectChange(index, { needsReview: !event.target.checked })}/> I reviewed this subject row</label>
          <span>{subject.needsReview ? "Needs review" : `OCR confidence ${Math.round(subject.confidence)}%`}</span>
          <button type="button" className="academic-remove-subject" onClick={() => onRemoveSubject(index)}>Remove</button>
        </div>
      </article>)}
    </div>
    <div className="academic-total-fields">
      <label>Printed total obtained<input type="number" min="0" step="0.01" value={extraction.officialTotalMarks ?? ""} onChange={(event) => onFieldsChange({ officialTotalMarks: numberValue(event.target.value) })}/></label>
      <label>Printed maximum total<input type="number" min="0" step="0.01" value={extraction.officialMaximumTotalMarks ?? ""} onChange={(event) => onFieldsChange({ officialMaximumTotalMarks: numberValue(event.target.value) })}/></label>
      <label>Printed percentage<input type="number" min="0" max="100" step="0.01" value={extraction.officialPercentage ?? ""} onChange={(event) => onFieldsChange({ officialPercentage: numberValue(event.target.value) })}/></label>
    </div>
    <div className="academic-calculated-summary">
      <strong>Calculated from reviewed subject rows</strong>
      <span>Total: {summary.totalMarks ?? "Needs review"}{summary.maximumTotalMarks !== null ? ` / ${summary.maximumTotalMarks}` : ""}</span>
      <span>Percentage: {summary.percentage === null ? "Needs complete numeric marks and maximums" : `${summary.percentage}%`}</span>
      {summary.totalMismatch && <span className="academic-mismatch">The printed total differs from the calculated total. The difference will be flagged for review.</span>}
      {extraction.officialPercentage !== null && summary.percentage !== null && Math.abs(extraction.officialPercentage - summary.percentage) > 0.05 && <span className="academic-mismatch">The printed percentage differs from the calculated percentage.</span>}
    </div>
  </section>;
}
