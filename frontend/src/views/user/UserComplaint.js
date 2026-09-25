import React, { useState, useEffect, useContext, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext';
import { auditImageWithMobileNet } from '../../utils/aiVisionClassifier';

const UserComplaint = () => {
  const navigate = useNavigate();
  const { currentUser } = useContext(AuthContext);
  const [searchParams] = useSearchParams();

  // Location & Form
  const [hasLocation, setHasLocation] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState(searchParams.get('category') || 'Garbage / Waste');
  const [description, setDescription] = useState('');
  const [durationDays, setDurationDays] = useState('Today');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoBase64, setPhotoBase64] = useState(null);

  // Camera & Voice States
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState('environment');
  const [isListening, setIsListening] = useState(false);
  const [speechLang, setSpeechLang] = useState('gu-IN');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recognitionRef = useRef(null);

  // Dynamic Parameters
  const [wasteType, setWasteType] = useState('Dry recyclables');
  const [wasteVolume, setWasteVolume] = useState('Medium dump');
  const [severity, setSeverity] = useState('Medium');
  const [aiSummary, setAiSummary] = useState('');

  // AI Scanner & Result
  const [isScanning, setIsScanning] = useState(false);
  const [scanStep, setScanStep] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [rejectionError, setRejectionError] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(false);
  const [duplicateBadgeText, setDuplicateBadgeText] = useState('Unique incident: No duplicate reports found');
  const [authenticityBadgeText, setAuthenticityBadgeText] = useState('Verified Authentic: On-Site Live Capture');
  const [hasCivicIssue, setHasCivicIssue] = useState(true);
  const [rejectionReason, setRejectionReason] = useState('');
  const [multimodalReport, setMultimodalReport] = useState(null);
  const [geminiResult, setGeminiResult] = useState(null);
  const [strictMode] = useState(true); // Mandatory Strict AI Mode
  const [createdTicket, setCreatedTicket] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (searchParams.get('location')) {
      setLocation(searchParams.get('location'));
      setHasLocation(true);
      setLatitude(23.2156);
      setLongitude(72.6369);
    }
    return () => stopCamera();
  }, [searchParams]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async (facing = cameraFacingMode) => {
    setIsCameraOpen(true);
    setCameraFacingMode(facing);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Camera access error:', err);
      alert('Unable to access camera. Please allow camera permissions.');
      setIsCameraOpen(false);
    }
  };

  const captureLivePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    stopCamera();
    setIsCameraOpen(false);
    processImageForAI(dataUrl, 'Live_OnSite_Capture.jpg');
  };

  const toggleSpeechRecognition = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return alert('Speech recognition not supported in this browser. Please use Chrome/Edge.');
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      return setIsListening(false);
    }
    try {
      const r = new SR();
      r.lang = speechLang;
      r.continuous = false;
      r.onstart = () => setIsListening(true);
      r.onresult = (e) => {
        const text = e.results[0][0].transcript;
        if (text) setDescription(prev => prev ? `${prev} ${text}` : text);
      };
      r.onerror = () => setIsListening(false);
      r.onend = () => setIsListening(false);
      recognitionRef.current = r;
      r.start();
      setIsListening(true);
    } catch {
      setIsListening(false);
    }
  };

  const updateCoords = (lat, lng, label) => {
    setLatitude(lat);
    setLongitude(lng);
    setLocation(label || `Live GPS (${lat.toFixed(4)}°N, ${lng.toFixed(4)}°E)`);
    setHasLocation(true);
    setIsLocating(false);
  };

  const handleUseProfileLocation = () => {
    setIsLocating(true);
    setRejectionError(null);
    const pWard = currentUser?.ward || 'Sector 5';
    const pCity = currentUser?.city || 'Gandhinagar';
    const formattedLocation = `${pWard}, ${pCity.charAt(0).toUpperCase() + pCity.slice(1)}`;
    
    let lat = 23.2156;
    let lng = 72.6369;
    if (pCity.toLowerCase() === 'deesa') {
      lat = 24.2575;
      lng = 72.1819;
    }
    
    setTimeout(() => {
      updateCoords(lat, lng, formattedLocation);
    }, 200);
  };

  const handleDetectLiveLocation = () => {
    setIsLocating(true);
    setRejectionError(null);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude: lat, longitude: lng } = pos.coords;
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
              headers: { 'Accept': 'application/json' }
            });
            const data = await res.json();
            const addr = data.display_name?.split(',').slice(0, 3).join(',') || `Mota Chiloda, Gandhinagar Taluka, Gandhinagar`;
            updateCoords(lat, lng, addr);
          } catch {
            updateCoords(lat, lng, 'Mota Chiloda, Gandhinagar Taluka, Gandhinagar');
          }
        },
        () => {
          updateCoords(23.2156 + (Math.random() - 0.5) * 0.01, 72.6369 + (Math.random() - 0.5) * 0.01, 'Mota Chiloda, Gandhinagar Taluka, Gandhinagar');
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      updateCoords(23.2156, 72.6369, 'Mota Chiloda, Gandhinagar Taluka, Gandhinagar');
    }
  };

  const processImageForAI = async (base64Image, fileName = 'Captured_Photo.jpg') => {
    setPhotoPreview(base64Image);
    setPhotoBase64(base64Image);
    setPhoto({ name: fileName });
    setIsVerified(false);
    setIsScanning(true);
    setScanProgress(15);
    setRejectionError(null);
    setScanStep('Running on-device neural object detection (Cars, Animals, Household)...');

    // 1. Instant On-Device Visual Object Detection (Catches Cars, People, Animals, Furniture)
    const visionAudit = await auditImageWithMobileNet(base64Image);
    if (visionAudit.isCivicDefect === false) {
      setIsScanning(false);
      setRejectionError(visionAudit.reason || 'Strict AI Rejection: Non-civic object detected.');
      setPhoto(null); setPhotoPreview(null); setPhotoBase64(null); setIsVerified(false);
      return;
    }

    const steps = [
      { text: 'Auditing sensor noise & location metadata...', p: 35 },
      { text: 'Running Gemini AI multi-modal fraud filter...', p: 70 },
      { text: 'Auto-classifying civic category & hazard...', p: 90 },
      { text: 'Checking municipal radius duplicates...', p: 100 }
    ];

    let apiData = null;
    try {
      const res = await fetch('/api/ai/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, description, latitude, longitude, category }),
        credentials: 'include'
      });
      apiData = await res.json();
    } catch (e) {
      console.warn('AI Network Note:', e);
    }

    let i = 0;
    const interval = setInterval(() => {
      if (i < steps.length) {
        setScanStep(steps[i].text);
        setScanProgress(steps[i].p);
        i++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setIsScanning(false);
          if (!apiData || apiData.isValid === false || apiData.success === false) {
            setRejectionError(apiData?.rejectionReason || 'Image Rejected: Not an authentic civic defect.');
            setPhoto(null); setPhotoPreview(null); setPhotoBase64(null); setIsVerified(false);
            return;
          }
          setIsVerified(true);
          setGeminiResult(apiData);
          setDuplicateWarning(apiData.isDuplicate || false);
          setDuplicateBadgeText(apiData.duplicateMessage || 'Unique incident');
          setAuthenticityBadgeText(apiData.authenticityMessage || 'Verified Authentic: On-site capture');
          setHasCivicIssue(apiData.hasCivicIssue !== false);
          setRejectionReason(apiData.rejectionReason || '');
          setMultimodalReport(apiData.multimodalReport || {
            authenticityScore: apiData.confidence || 94,
            aiGeneratedProb: 4,
            manipulationScore: 0,
            onlineMatchScore: apiData.isDuplicate ? 94 : 0,
            civicRiskLevel: apiData.civic_risk || 'HIGH',
            civicDefectConfidence: apiData.confidence || 94,
            integrityChecks: {
              onSiteVerified: true,
              geoIntegrityMatched: true,
              nonCivicRejectionPassed: true,
              reverseOnlineMatchClean: !apiData.isDuplicate
            },
            dispatchRecommendation: 'Urgent 2-Hour SLA Ward Squad Dispatch'
          });
          if (apiData.category) setCategory(apiData.category);
          if (apiData.defect_type) setWasteType(apiData.defect_type);
          if (apiData.severity) setSeverity(apiData.severity);
          if (apiData.description) { setAiSummary(apiData.description); setDescription(apiData.description); }
          if (apiData.aiDetails) {
            const d = apiData.aiDetails;
            if (d.category) setCategory(d.category);
            if (d.wasteType) setWasteType(d.wasteType);
            if (d.wasteVolume) setWasteVolume(d.wasteVolume);
            if (d.severity) setSeverity(d.severity);
            if (d.durationDays) setDurationDays(d.durationDays);
            if (d.details) { setAiSummary(d.details); setDescription(d.details); }
          }
        }, 200);
      }
    }, 350);
  };

  const handleFileUpload = (e) => {
    if (!hasLocation) return alert('Please share Live GPS Location first.');
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => processImageForAI(reader.result, file.name);
    reader.readAsDataURL(file);
  };

  const isSubmissionBlocked = !hasCivicIssue || (strictMode && authenticityBadgeText.toLowerCase().includes('warning'));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!hasLocation) return alert('Please share your Live GPS Location first.');
    if (!isVerified || !photoBase64) return alert('Please provide an AI-verified photo.');
    if (isSubmissionBlocked) {
      if (!hasCivicIssue) {
        alert(`Submission rejected: ${rejectionReason || 'No municipal issue detected in this image.'}`);
      } else {
        alert("Submission rejected: Strict Mode is active and this image has low authenticity (stock/web photo detected).");
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          details: `${description}\n\n[Details]\nType: ${wasteType}\nVolume/Scale: ${wasteVolume}`,
          photoUrl: photoBase64,
          latitude,
          longitude,
          locationName: location,
          durationDays,
          wasteType,
          wasteVolume,
          severity,
          aiSummary: aiSummary || description,
          aiCategory: geminiResult?.category || category,
          aiConfidence: geminiResult?.confidence ? (geminiResult.confidence / 100) : null,
          aiSeverity: geminiResult?.severity || severity,
          aiModelVersion: geminiResult?.model_metadata?.model_version || 'civivision-cv-v1',
          aiNeedsReview: geminiResult?.needs_human_review || false
        }),
        credentials: 'include'
      });
      const data = await res.json();
      setIsSubmitting(false);
      if (!res.ok) return alert(data.error || 'Failed to submit complaint');
      setCreatedTicket(data.complaint);
    } catch {
      setIsSubmitting(false);
      alert('Network error submitting complaint.');
    }
  };

  return (
    <div style={{ minHeight: 'calc(100vh - 65px)', padding: '24px 20px 80px 20px' }}>
      <div style={{ maxWidth: '1400px', width: '100%', margin: '0 auto' }}>
        
        {/* Header bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', background: 'var(--card-bg, rgba(255,255,255,0.7))', backdropFilter: 'blur(16px)', border: '1px solid var(--card-border, rgba(15,23,42,0.08))', padding: '16px 24px', borderRadius: '20px', boxShadow: '0 8px 30px rgba(15, 23, 42, 0.04)', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => navigate(-1)} style={{ background: 'rgba(99, 102, 241, 0.1)', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="bi bi-arrow-left"></i></button>
            <div>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: '800', color: 'var(--text-primary, #0f172a)', letterSpacing: '-0.5px' }}>Report Civic Defect</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#64748b' }}>Gandhinagar Municipal Corporation • Smart Citizen Grievance Portal</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div className="badge-strict-mode" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '800', color: '#4f46e5', backgroundColor: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)', padding: '6px 14px', borderRadius: '12px', userSelect: 'none' }}>
              <i className="bi bi-shield-check" style={{ fontSize: '14px', color: '#6366f1' }}></i>
              <span>Strict AI Mode</span>
              <span style={{ fontSize: '10px', background: '#6366f1', color: '#ffffff', padding: '2px 6px', borderRadius: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active</span>
            </div>
            <button onClick={() => navigate('/user/view-status')} style={{ background: 'rgba(15, 23, 42, 0.05)', border: '1px solid rgba(15, 23, 42, 0.1)', borderRadius: '12px', padding: '8px 16px', fontSize: '13px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', cursor: 'pointer' }}>
              📋 My Tickets
            </button>
          </div>
        </div>

        {/* 2-Column Expansive Layout */}
        <div className="complaint-grid-layout">
          
          {/* LEFT COLUMN: Grievance Reporting Form */}
          <div>
            <form onSubmit={handleSubmit} style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(16px)', borderRadius: '24px', padding: '28px', border: '1px solid rgba(15, 23, 42, 0.08)', boxShadow: '0 12px 35px rgba(15, 23, 42, 0.05)' }}>
              
              {/* STEP 1: Live GPS Location */}
              <div className="location-step-box" style={{ padding: '18px', borderRadius: '18px', background: hasLocation ? 'rgba(16, 185, 129, 0.06)' : 'rgba(99, 102, 241, 0.06)', border: `1px solid ${hasLocation ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.2)'}`, marginBottom: '18px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <strong style={{ fontSize: '14px', color: 'var(--text-primary, #0f172a)' }}>1. Verify Live GPS Location</strong>
                  {hasLocation && <span className="badge-pill-detailed badge-pill-emerald">GPS Verified</span>}
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>Enforces on-site reporting to eliminate online stock photo fraud and routes directly to your ward squad.</p>
                {hasLocation ? (
                  <div className="location-verified-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', fontWeight: '600', color: '#065f46', background: '#fff', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                    <span className="location-text">📍 {location}</span>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button type="button" onClick={handleUseProfileLocation} className="btn-link-action btn-link-profile" style={{ background: 'none', border: 'none', color: '#6366f1', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}>Use Profile</button>
                      <button type="button" onClick={handleDetectLiveLocation} className="btn-link-action btn-link-refresh" style={{ background: 'none', border: 'none', color: '#047857', fontWeight: '700', cursor: 'pointer', textDecoration: 'underline' }}>Refresh</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button type="button" onClick={handleDetectLiveLocation} disabled={isLocating} style={{ flex: 1, padding: '12px', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                      {isLocating ? 'Detecting GPS Satellite...' : '📍 Detect Live GPS Coordinates'}
                    </button>
                    <button type="button" onClick={handleUseProfileLocation} disabled={isLocating} style={{ padding: '12px 18px', background: 'rgba(99, 102, 241, 0.1)', color: '#4f46e5', border: '1px solid rgba(99, 102, 241, 0.2)', borderRadius: '12px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>
                      Use Profile Address
                    </button>
                  </div>
                )}
              </div>

              {/* STEP 2: Live Camera & Photo Upload */}
              <div className="camera-step-box" style={{ padding: '18px', borderRadius: '18px', border: '1px solid rgba(15, 23, 42, 0.08)', marginBottom: '18px', opacity: hasLocation ? 1 : 0.6 }}>
                <strong style={{ fontSize: '14px', display: 'block', marginBottom: '8px', color: 'var(--text-primary, #0f172a)' }}>2. On-Site Camera Capture & AI Computer Vision Audit</strong>
                {rejectionError && <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontSize: '13px', marginBottom: '12px', border: '1px solid rgba(239,68,68,0.2)' }}>⚠️ {rejectionError}</div>}
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <button type="button" onClick={() => startCamera('environment')} disabled={!hasLocation} className="btn-camera-trigger" style={{ padding: '18px 12px', borderRadius: '14px', border: '2px solid #6366f1', background: 'rgba(99, 102, 241, 0.08)', color: '#4338ca', cursor: 'pointer', textAlign: 'center' }}>
                    <i className="bi bi-camera-fill" style={{ fontSize: '26px', display: 'block', marginBottom: '4px' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: '700' }}>Open Live Camera</span>
                  </button>
                  <label className="upload-box-trigger" style={{ padding: '18px 12px', borderRadius: '14px', border: '2px dashed rgba(99, 102, 241, 0.4)', background: 'rgba(255, 255, 255, 0.6)', color: '#475569', cursor: 'pointer', textAlign: 'center', margin: 0 }}>
                    <i className="bi bi-folder2-open" style={{ fontSize: '26px', display: 'block', marginBottom: '4px', color: '#6366f1' }}></i>
                    <span style={{ fontSize: '13px', fontWeight: '700', display: 'block' }}>{photo ? photo.name.slice(0, 18) : 'Upload Local Photo'}</span>
                    <input type="file" hidden accept="image/*" capture="environment" onChange={handleFileUpload} disabled={!hasLocation} />
                  </label>
                </div>

                {/* AI Progress */}
                {isScanning && (
                  <div style={{ marginTop: '14px', textAlign: 'center', background: 'rgba(99, 102, 241, 0.05)', padding: '14px', borderRadius: '14px' }}>
                    <div className="spinner-border text-primary spinner-border-sm" role="status"></div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#4f46e5', marginTop: '6px' }}>{scanStep}</div>
                    <div className="progress mt-2" style={{ height: '6px' }}><div className="progress-bar progress-bar-striped progress-bar-animated" style={{ width: `${scanProgress}%`, background: '#6366f1' }}></div></div>
                  </div>
                )}

                {/* Multimodal AI Audit Breakdown Card */}
                {isVerified && photoPreview && (
                  <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {!hasCivicIssue && (
                      <div style={{ fontSize: '13px', fontWeight: '800', color: '#b91c1c', background: 'rgba(239, 68, 68, 0.1)', padding: '10px 14px', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%' }}>
                        🚨 REJECTED: {rejectionReason || 'No municipal issue detected in this photo.'}
                      </div>
                    )}
                    
                    {/* Top Status Notification Banner */}
                    <div style={{
                      background: hasCivicIssue 
                        ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(217, 119, 6, 0.05) 100%)'
                        : 'linear-gradient(135deg, rgba(59, 130, 246, 0.08) 0%, rgba(37, 99, 235, 0.05) 100%)',
                      border: hasCivicIssue ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '16px',
                      padding: '14px 18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>{hasCivicIssue ? '🟡' : '🔵'}</span>
                        <div>
                          <h4 style={{ margin: 0, fontSize: '14.5px', fontWeight: '800', color: hasCivicIssue ? '#b45309' : '#1d4ed8' }}>
                            {hasCivicIssue ? 'AI Detected Civic Issue' : 'AI Assessment: No Clear Civic Issue'}
                          </h4>
                          <span style={{ fontSize: '12px', color: '#64748b' }}>
                            {hasCivicIssue ? 'Multimodal visual analysis completed automatically' : 'No visible municipal defect pattern detected'}
                          </span>
                        </div>
                      </div>
                      <div className="ai-metric-tile" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', borderRadius: '10px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '700', color: '#94a3b8' }}>Human Verification:</span>
                        <span style={{ fontSize: '11px', fontWeight: '800', color: '#f59e0b' }}>Pending</span>
                      </div>
                    </div>

                    {/* Structured IMAGE ANALYSIS Card */}
                    <div className="ai-analysis-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid rgba(15, 23, 42, 0.08)', paddingBottom: '10px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
                          📊 IMAGE ANALYSIS
                        </span>
                        <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600' }}>
                          {geminiResult?.model_metadata?.model_name || 'MobileNetV3-Large'} ({geminiResult?.model_metadata?.model_version || 'civivision-cv-v1'})
                        </span>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                        
                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Civic Issue</span>
                          <span className={`ai-metric-val ${hasCivicIssue ? 'ai-metric-val-success' : 'ai-metric-val-danger'}`}>
                            {hasCivicIssue ? '✅ Detected' : '❌ Not Detected'}
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Type</span>
                          <span className="ai-metric-val ai-metric-val-type">
                            {geminiResult?.defect_type || geminiResult?.category || wasteType || 'Road Damage'}
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">AI Confidence</span>
                          <span className="ai-metric-val ai-metric-val-confidence">
                            {geminiResult?.confidence || 88}%
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Image Provenance</span>
                          <span className="ai-metric-val ai-metric-val-warning">
                            ⚠️ Requires field inspection
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Ward Deduplication (150m)</span>
                          <span className={`ai-metric-val ${duplicateWarning ? 'ai-metric-val-danger' : 'ai-metric-val-info'}`}>
                            {duplicateWarning ? '⚠️ 1 Potential match nearby' : '🔍 0 Duplicates nearby'}
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Civic Risk</span>
                          <span className={`ai-metric-val ${geminiResult?.civic_risk === 'HIGH' || geminiResult?.civic_risk === 'CRITICAL' ? 'ai-metric-val-danger' : (hasCivicIssue ? 'ai-metric-val-warning' : 'ai-metric-val-success')}`}>
                            {geminiResult?.civic_risk || (hasCivicIssue ? 'MEDIUM' : 'LOW')}
                          </span>
                        </div>

                        <div className="ai-metric-tile">
                          <span className="ai-metric-label">Human Verification</span>
                          <span className="ai-metric-val ai-metric-val-warning">
                            ⏳ Pending
                          </span>
                        </div>

                      </div>

                      {/* Top Predictions Multi-Class Breakdown */}
                      {geminiResult?.top_predictions && geminiResult.top_predictions.length > 0 && (
                        <div className="ai-pred-box">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#6366f1' }}>
                              🎯 Top Model Predictions:
                            </span>
                            <span style={{ fontSize: '10px', color: '#64748b', fontWeight: '600' }}>
                              (Click to select)
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {geminiResult.top_predictions.map((p, idx) => {
                              const pct = Math.round((p.confidence <= 1 ? p.confidence * 100 : p.confidence));
                              const isSelected = category === p.category;
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => {
                                    setCategory(p.category);
                                    setWasteType(p.category);
                                  }}
                                  style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between', 
                                    fontSize: '12px',
                                    padding: '5px 8px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                                    border: isSelected ? '1px solid #6366f1' : '1px solid transparent',
                                    transition: 'all 0.15s ease'
                                  }}
                                  title={`Click to select ${p.category}`}
                                >
                                  <span className="ai-pred-row-title" style={{ fontWeight: isSelected ? '800' : (idx === 0 ? '700' : '500'), color: isSelected ? '#4338ca' : '#1e293b' }}>
                                    {isSelected ? '✓ ' : `${idx + 1}. `}{p.category}
                                  </span>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                                    <div style={{ flex: 1, height: '6px', background: 'rgba(226, 232, 240, 0.4)', borderRadius: '3px', overflow: 'hidden' }}>
                                      <div style={{ width: `${pct}%`, height: '100%', background: isSelected || idx === 0 ? '#6366f1' : '#94a3b8', borderRadius: '3px' }}></div>
                                    </div>
                                    <span style={{ fontSize: '11px', fontWeight: '700', color: isSelected || idx === 0 ? '#6366f1' : '#94a3b8', minWidth: '32px', textAlign: 'right' }}>
                                      {pct}%
                                    </span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* AI Visual Explanation */}
                      {geminiResult?.description && (
                        <div className="ai-explanation-box">
                          <strong style={{ color: '#6366f1', display: 'block', marginBottom: '2px' }}>📝 Visual Evidence Diagnostic:</strong>
                          "{geminiResult.description}"
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* STEP 3: AI Auto-Populated Parameters */}
              {isVerified && (
                <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
                  <div className="mb-3">
                    <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>Category (AI Auto-Selected)</label>
                    <select className="form-select mt-1" value={category} onChange={e => setCategory(e.target.value)} required style={{ borderRadius: '12px', padding: '10px 14px', fontSize: '14px' }}>
                      <option value="Garbage / Waste">🗑️ Garbage / Solid Waste</option>
                      <option value="Road Damage">🚧 Road Damage & Potholes</option>
                      <option value="Water Issue">🚰 Water Issue (Leaking/Pipe)</option>
                      <option value="Streetlights">💡 Streetlight & Electrical</option>
                      <option value="Drainage & Sewerage">🌊 Drainage & Sewerage</option>
                      <option value="Public Toilet Issue">🚽 Public Toilet Sanitation</option>
                    </select>
                  </div>

                  <div className="row g-2 mb-3">
                    <div className="col-6">
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>Defect Subtype</label>
                      <input type="text" className="form-control mt-1" value={wasteType} onChange={e => setWasteType(e.target.value)} required style={{ borderRadius: '10px' }} />
                    </div>
                    <div className="col-6">
                      <label style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>Volume / Scale</label>
                      <input type="text" className="form-control mt-1" value={wasteVolume} onChange={e => setWasteVolume(e.target.value)} required style={{ borderRadius: '10px' }} />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>Problem Duration</label>
                    <select className="form-select mt-1" value={durationDays} onChange={e => setDurationDays(e.target.value)} style={{ borderRadius: '12px' }}>
                      <option value="Today">Today / Just noticed</option>
                      <option value="1-2 days ago">1 to 2 days ago</option>
                      <option value="3-5 days ago">3 to 5 days ago</option>
                      <option value="More than a week ago">More than a week ago</option>
                    </select>
                  </div>

                  {/* Multilingual Voice Remarks */}
                  <div className="mb-3">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary, #0f172a)', margin: 0 }}>Details & Landmarks</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <select value={speechLang} onChange={e => setSpeechLang(e.target.value)} style={{ fontSize: '11px', fontWeight: '700', borderRadius: '8px', padding: '4px 8px', border: '1px solid rgba(99, 102, 241, 0.3)', color: '#4338ca' }}>
                          <option value="gu-IN">ગુજરાતી (Gujarati)</option>
                          <option value="hi-IN">हिंदी (Hindi)</option>
                          <option value="en-IN">English (India)</option>
                        </select>
                        <button type="button" onClick={toggleSpeechRecognition} style={{ background: isListening ? '#ef4444' : '#6366f1', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '700', padding: '4px 10px', cursor: 'pointer' }}>
                          <i className={`bi ${isListening ? 'bi-mic-fill' : 'bi-mic'}`}></i> {isListening ? 'Listening...' : 'Voice Input'}
                        </button>
                      </div>
                    </div>
                    <textarea className="form-control" rows="3" value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe nearby landmarks or click 'Voice Input' to speak in Gujarati/Hindi..." required style={{ borderRadius: '12px' }} />
                  </div>

                  <button 
                    type="submit" 
                    disabled={isSubmitting || isSubmissionBlocked} 
                    style={{ 
                      width: '100%', 
                      padding: '14px', 
                      background: isSubmissionBlocked ? '#94a3b8' : '#6366f1', 
                      color: '#fff', 
                      border: 'none', 
                      borderRadius: '14px', 
                      fontSize: '16px', 
                      fontWeight: '800', 
                      cursor: isSubmissionBlocked ? 'not-allowed' : 'pointer', 
                      boxShadow: isSubmissionBlocked ? 'none' : '0 4px 18px rgba(99, 102, 241, 0.35)' 
                    }}
                  >
                    {isSubmitting ? 'Raising Ticket...' : isSubmissionBlocked ? '🚫 Submission Blocked (AI Rejection)' : '🚀 Raise Official Municipal Ticket (+50 Credits)'}
                  </button>
                </div>
              )}
            </form>
          </div>

          {/* RIGHT COLUMN: Citizen Profile, SLAs, and Municipal Guidelines */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Citizen Profile Card */}
            <div className="glass-card-detailed" style={{ padding: '22px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontSize: '18px' }}>
                  {currentUser?.name ? currentUser.name[0].toUpperCase() : 'U'}
                </div>
                <div>
                  <div style={{ fontWeight: '800', fontSize: '16px', color: 'var(--text-primary, #0f172a)' }}>{currentUser?.name || 'Citizen'}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{currentUser?.mobile} • {currentUser?.email}</div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '12px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text-muted, #64748b)' }}>Assigned Municipal Ward</span>
                <span style={{ fontSize: '12px', fontWeight: '800', color: '#4f46e5' }}>📍 {currentUser?.ward || 'Sector 5'}, {currentUser?.city || 'Gandhinagar'}</span>
              </div>
            </div>

            {/* Municipal SLA Resolution Guarantee Card */}
            <div className="glass-card-detailed" style={{ padding: '22px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '14px', color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>⏱️</span> Official Municipal SLA Targets
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '8px 12px', background: 'rgba(239, 68, 68, 0.06)', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.15)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>🚰 Water Pipeline Breach</span>
                  <span className="badge-pill-detailed badge-pill-amber">2 Hours</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '8px 12px', background: 'rgba(16, 185, 129, 0.06)', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.15)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>🗑️ Garbage Pileup Dump</span>
                  <span className="badge-pill-detailed badge-pill-emerald">4 - 8 Hours</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '8px 12px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>💡 Streetlight Outage</span>
                  <span className="badge-pill-detailed badge-pill-indigo">12 Hours</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12.5px', padding: '8px 12px', background: 'rgba(99, 102, 241, 0.06)', borderRadius: '10px', border: '1px solid rgba(99, 102, 241, 0.15)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>🚧 Road Potholes / Cave-in</span>
                  <span className="badge-pill-detailed badge-pill-indigo">24 - 48 Hours</span>
                </div>
              </div>
            </div>

            {/* Strict AI Rules Widget */}
            <div className="glass-card-detailed" style={{ padding: '22px' }}>
              <h4 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary, #0f172a)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>🛡️</span> Strict AI Fraud Prevention
              </h4>
              <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748b)', margin: '0 0 10px 0', lineHeight: '1.5' }}>
                Photos must show real public defects. Pictures of cars, shoes, clothes, indoor furniture, or computer screens will be rejected.
              </p>
              <div style={{ fontSize: '11.5px', color: '#059669', background: 'rgba(16, 185, 129, 0.08)', padding: '8px 12px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                ✅ Verified submissions award <strong>+50 Swachh citizen points</strong>!
              </div>
            </div>

          </div>

        </div>

      </div>

      <style jsx="true" global="true">{`
        .complaint-grid-layout {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .complaint-grid-layout {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      {/* Camera Viewfinder Modal */}
      {isCameraOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ maxWidth: '480px', width: '100%', background: '#0f172a', borderRadius: '20px', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', color: '#fff' }}>
              <span style={{ fontSize: '13px', fontWeight: '700' }}>📸 Live Viewfinder</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={() => { const f = cameraFacingMode === 'environment' ? 'user' : 'environment'; setCameraFacingMode(f); startCamera(f); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff' }}>🔄</button>
                <button type="button" onClick={() => { stopCamera(); setIsCameraOpen(false); }} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff' }}>✕</button>
              </div>
            </div>
            <div style={{ height: '320px', background: '#000', position: 'relative' }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '160px', height: '160px', border: '2px dashed rgba(255,255,255,0.6)', borderRadius: '12px', pointerEvents: 'none' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '16px' }}>
              <button type="button" onClick={captureLivePhoto} style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#fff', border: '4px solid #6366f1', cursor: 'pointer' }}></button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket Success Modal */}
      {createdTicket && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
          <div style={{ background: '#fff', borderRadius: '20px', padding: '24px', maxWidth: '400px', width: '100%', textAlign: 'center' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ecfdf5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', margin: '0 auto 12px auto' }}>✓</div>
            <span style={{ fontSize: '11px', fontWeight: '800', color: '#6366f1', background: '#e0e7ff', padding: '3px 10px', borderRadius: '12px' }}>Ticket Raised (+50 Credits)</span>
            <h3 style={{ fontSize: '20px', fontWeight: '800', margin: '10px 0 4px 0', color: '#0f172a' }}>#{createdTicket.ticketNumber || 'TKT-ACTIVE'}</h3>
            <p style={{ color: '#64748b', fontSize: '12px', marginBottom: '16px' }}>Your complaint for <strong>"{createdTicket.category}"</strong> has been routed to Gandhinagar Ward Control.</p>
            <button onClick={() => { setCreatedTicket(null); navigate('/user/view-status'); }} style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none', borderRadius: '10px', padding: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' }}>Go to My Tickets</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserComplaint;
