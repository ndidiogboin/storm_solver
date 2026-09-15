function buildTitleBlock(doc, meta){
    const TOP_OFFSET = 36;
    doc.autoTable({
        startY: TOP_OFFSET,
        margin: { left:25, right:25 },
        tableWidth: 'wrap',
        body: [
            [{ content: "CLIENT: " + (meta.client || ""), colSpan:3 }],
            [{ content: "CONSULTANT: " + (meta.consultant || ""), colSpan:3 }],
            [{ content: "PROJECT: " + (meta.projectTitle || ""), colSpan:3 }],
            ["DESIGN CODES: " + (meta.designCodes || ""), "REF NO: " + (meta.referenceNo || ""), "DATE: " + (meta.date || "")],
            ["DESIGNED BY: " + (meta.designedBy || ""), "CHECKED BY: " + (meta.checkedBy || ""), "APPROVED BY: " + (meta.approvedBy || "")]
        ],
        theme: "grid",
        styles: { fontSize:9, cellPadding:3, valign:"middle", textColor:0, overflow:"linebreak", cellWidth:"wrap", lineColor:[0,0,0], lineWidth:0.07 },
        columnStyles: { 0:{cellWidth:60}, 1:{cellWidth:54}, 2:{cellWidth:50} },
        didParseCell: function(data){
            if(data.row.index===0){ data.cell.styles.fillColor=[221,235,247]; data.cell.styles.fontStyle="bold"; data.cell.styles.fontSize=11; if(data.column.index===0) data.cell.styles.textColor=[0,102,204]; }
            if(data.row.index===1){ data.cell.styles.fillColor=[252,242,242]; data.cell.styles.fontStyle="bold"; data.cell.styles.fontSize=11; if(data.column.index===0) data.cell.styles.textColor=[0,153,0]; }
            if(data.row.index===2){ data.cell.styles.fillColor=[255,242,204]; data.cell.styles.fontStyle="bold"; data.cell.styles.fontSize=8; data.cell.styles.halign="left"; data.cell.styles.minCellHeight=10; }
            if(data.row.index===3){ data.cell.styles.fillColor=[252,242,242]; data.cell.styles.fontSize=7; data.cell.styles.minCellHeight=10; }
            if(data.row.index===4){ data.cell.styles.fillColor=[221,235,247]; data.cell.styles.fontSize=7; data.cell.styles.minCellHeight=10; }
        }
    });
    return doc.lastAutoTable.finalY;
}

const projectKey = "storm_titleblock_{{project}}";

window.reportMeta = window.projectData?.title_block ? {

    projectTitle:      window.projectData.title_block.project_title      || "",
    projectLocation:   window.projectData.title_block.project_location   || "",

    client:            window.projectData.title_block.client             || "",
    clientLogo:        window.projectData.title_block.client_logo        || "",

    consultant:        window.projectData.title_block.consultant         || "",
    consultantLogo:    window.projectData.title_block.consultant_logo    || "",

    contractor:        window.projectData.title_block.contractor         || "",

    designCodes:       window.projectData.title_block.design_codes       || "",
    referenceNo:       window.projectData.title_block.reference_no       || "",

    date:              window.projectData.title_block.date               || "",
    revisionDate:      window.projectData.title_block.revision_date      || "",

    designedBy:        window.projectData.title_block.designed_by        || "",
    checkedBy:         window.projectData.title_block.checked_by         || "",
    approvedBy:        window.projectData.title_block.approved_by        || ""

} : {

    projectTitle:"",
    projectLocation:"",

    client:"",
    clientLogo:"",

    consultant:"",
    consultantLogo:"",

    contractor:"",

    designCodes:"",
    referenceNo:"",

    date:"",
    revisionDate:"",

    designedBy:"",
    checkedBy:"",
    approvedBy:""

};

function openTitleBlockModal(){

    document.getElementById("titleBlockModal").style.display = "block";

    document.getElementById("tbProjectTitle").value     = window.reportMeta.projectTitle || "";
    document.getElementById("tbProjectLocation").value  = window.reportMeta.projectLocation || "";

    document.getElementById("tbClient").value           = window.reportMeta.client || "";
    document.getElementById("tbConsultant").value       = window.reportMeta.consultant || "";
    document.getElementById("tbContractor").value       = window.reportMeta.contractor || "";

    document.getElementById("tbDesignCodes").value      = window.reportMeta.designCodes || "";
    document.getElementById("tbReferenceNo").value      = window.reportMeta.referenceNo || "";

    document.getElementById("tbDate").value             = window.reportMeta.date || "";
    document.getElementById("tbRevisionDate").value     = window.reportMeta.revisionDate || "";

    document.getElementById("tbDesignedBy").value       = window.reportMeta.designedBy || "";
    document.getElementById("tbCheckedBy").value        = window.reportMeta.checkedBy || "";
    document.getElementById("tbApprovedBy").value       = window.reportMeta.approvedBy || "";

    // Reset file pickers (does NOT remove saved logos)
    document.getElementById("tbClientLogo").value = "";
    document.getElementById("tbConsultantLogo").value = "";

    // ---------------------------------------
    // Load saved logo previews
    // ---------------------------------------

    const clientPreview      = document.getElementById("clientLogoPreview");
    const consultantPreview  = document.getElementById("consultantLogoPreview");

    if(window.reportMeta.clientLogo){

        clientPreview.src =
            `/project-assets/${window.currentProject}/${window.reportMeta.clientLogo}`;

        clientPreview.style.display = "block";

    }else{

        clientPreview.src = "";
        clientPreview.style.display = "none";

    }

    if(window.reportMeta.consultantLogo){

        consultantPreview.src =
            `/project-assets/${window.currentProject}/${window.reportMeta.consultantLogo}`;

        consultantPreview.style.display = "block";

    }else{

        consultantPreview.src = "";
        consultantPreview.style.display = "none";

    }

}

function closeTitleBlockModal(){

    document.getElementById("titleBlockModal").style.display = "none";
}

async function saveTitleBlockData(){

    window.reportMeta.projectTitle     = document.getElementById("tbProjectTitle").value;
    window.reportMeta.projectLocation  = document.getElementById("tbProjectLocation").value;

    window.reportMeta.client           = document.getElementById("tbClient").value;
    window.reportMeta.consultant       = document.getElementById("tbConsultant").value;
    window.reportMeta.contractor       = document.getElementById("tbContractor").value;

    window.reportMeta.designCodes      = document.getElementById("tbDesignCodes").value;
    window.reportMeta.referenceNo      = document.getElementById("tbReferenceNo").value;

    window.reportMeta.date             = document.getElementById("tbDate").value;
    window.reportMeta.revisionDate     = document.getElementById("tbRevisionDate").value;

    window.reportMeta.designedBy       = document.getElementById("tbDesignedBy").value;
    window.reportMeta.checkedBy        = document.getElementById("tbCheckedBy").value;
    window.reportMeta.approvedBy       = document.getElementById("tbApprovedBy").value;

    try {

        const res = await fetch(`/api/title-block/${window.currentProject}`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({

                project_title:      window.reportMeta.projectTitle,
                project_location:   window.reportMeta.projectLocation,

                client:             window.reportMeta.client,
                client_logo:        window.reportMeta.clientLogo,

                consultant:         window.reportMeta.consultant,
                consultant_logo:    window.reportMeta.consultantLogo,

                contractor:         window.reportMeta.contractor,

                design_codes:       window.reportMeta.designCodes,
                reference_no:       window.reportMeta.referenceNo,

                date:               window.reportMeta.date,
                revision_date:      window.reportMeta.revisionDate,

                designed_by:        window.reportMeta.designedBy,
                checked_by:         window.reportMeta.checkedBy,
                approved_by:        window.reportMeta.approvedBy

            })

        });

        if (!res.ok) throw new Error("Save failed");

        await uploadLogo("client");
        await uploadLogo("consultant");

        closeTitleBlockModal();

        alert("Title block saved successfully");

    }
    catch(err){

        console.error(err);

        alert("Failed to save title block");

    }

}

// ==============================
// LIVE LOGO PREVIEW
// ==============================

document.getElementById("tbClientLogo").addEventListener("change", function(e){

    const file = e.target.files[0];

    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(ev){
        document.getElementById("clientLogoPreview").src = ev.target.result;
    };

    reader.readAsDataURL(file);

});


document.getElementById("tbConsultantLogo").addEventListener("change", function(e){

    const file = e.target.files[0];

    if(!file) return;

    const reader = new FileReader();

    reader.onload = function(ev){
        document.getElementById("consultantLogoPreview").src = ev.target.result;
    };

    reader.readAsDataURL(file);

});

// ==============================
// UPLOAD LOGO
// ==============================

async function uploadLogo(type){

    const input =
        type === "client"
        ? document.getElementById("tbClientLogo")
        : document.getElementById("tbConsultantLogo");

    if(input.files.length === 0){
        return;
    }

    const formData = new FormData();

    formData.append("logo", input.files[0]);

    const res = await fetch(
        `/api/upload-logo/${window.currentProject}/${type}`,
        {
            method: "POST",
            body: formData
        }
    );

    if(!res.ok){
        throw new Error(`${type} logo upload failed`);
    }

    const result = await res.json();
    console.log("Returned path =", result.path);
    alert(result.path);

    window.reportMeta[`${type}Logo`] = result.path;

    const preview =
        type === "client"
        ? document.getElementById("clientLogoPreview")
        : document.getElementById("consultantLogoPreview");

    preview.src =
        `/project-assets/${window.currentProject}/${result.path}`;

    preview.style.display = "block";

}


async function imageToDataURL(url){

    const response = await fetch(url);

    const blob = await response.blob();

    return await new Promise(resolve => {

        const reader = new FileReader();

        reader.onloadend = () => resolve(reader.result);

        reader.readAsDataURL(blob);

    });

}


async function buildCoverPage(doc, meta, documentTitle = "Engineering Report") {

    const pageWidth  = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const isLandscape = pageWidth > pageHeight;

    const layout = isLandscape
        ? {
            clientY: 0.10,
            projectY: 0.28,
            documentLabelY: 0.48,
            documentTitleY: 0.53,
            consultantY: 0.64,
            revisionY: 0.90
        }
        : {
            clientY: 0.10,
            projectY: 0.30,
            documentLabelY: 0.46,
            documentTitleY: 0.50,
            consultantY: 0.68,
            revisionY: 0.92
        };

    // White background
    doc.setFillColor(255,255,255);
    doc.rect(0,0,pageWidth,pageHeight,"F");

    // Border
    doc.setDrawColor(26,46,74);
    doc.setLineWidth(0.6);
    const borderMargin = 8;

    doc.rect(
        borderMargin,
        borderMargin,
        pageWidth - borderMargin * 2,
        pageHeight - borderMargin * 2
    );

    // ---------- CLIENT ----------
    const margin = 10;

    const logoSize = 20;

    const clientY = pageHeight * layout.clientY;

    const logoX = margin + 8;

    const textX = logoX + logoSize + 6;

    // Client logo (optional)
    if (meta.clientLogo) {

        try {

            const clientUrl =
                `/project-assets/${window.currentProject}/${meta.clientLogo}`;

            const clientImage =
                await imageToDataURL(clientUrl);

            doc.addImage(
                clientImage,
                "PNG",
                logoX,
                clientY,
                logoSize,
                logoSize
            );

        }
        catch(e){

            console.error("Client logo failed:", e);

        }

    }

    // Client heading
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(90,90,90);
    doc.text("CLIENT", textX, clientY + 4);

    // Client name
    doc.setFont("helvetica","bold");
    doc.setFontSize(20);
    doc.setTextColor(0,102,204);
    doc.text(meta.client || "CLIENT NAME", textX, clientY + 16);

    // ---------- PROJECT TITLE ----------

    const projectY = pageHeight * layout.projectY;

    // Label
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(90,90,90);

    doc.text(
        "PROJECT TITLE",
        pageWidth / 2,
        projectY,
        { align:"center" }
    );

    // Project title
    doc.setFont("helvetica","bold");
    doc.setFontSize(24);
    doc.setTextColor(26,46,74);

    doc.text(
        meta.projectTitle || "PROJECT TITLE",
        pageWidth / 2,
        projectY + 12,
        {
            align:"center",
            maxWidth: pageWidth * 0.75
        }
    );

   
    // ---------- DOCUMENT TITLE ----------

    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(90,90,90);

    doc.text(
        "DOCUMENT TITLE",
        pageWidth / 2,
        pageHeight * layout.documentLabelY,
        { align:"center" }
    );

    doc.setFont("helvetica","bold");
    doc.setFontSize(20);
    doc.setTextColor(26,46,74);

    doc.text(
        documentTitle || "Engineering Report",
        pageWidth / 2,
        pageHeight * layout.documentTitleY,
        { align:"center" }
    );

    // ---------- CONSULTANT ----------

    const consultantY = pageHeight * layout.consultantY;

    const consultantLogoX = margin + 8;

    const consultantTextX = consultantLogoX + logoSize + 6;

    // Consultant logo
    if (meta.consultantLogo) {

        try {

            const consultantUrl =
                `/project-assets/${window.currentProject}/${meta.consultantLogo}`;
            const consultantImage =
                await imageToDataURL(consultantUrl);

            doc.addImage(
                consultantImage,
                "PNG",
                consultantLogoX,
                consultantY,
                logoSize,
                logoSize
            );

        }
        catch(e){

            console.error("Consultant logo failed:", e);

        }

    }

    // Consultant heading
    doc.setFont("helvetica","bold");
    doc.setFontSize(10);
    doc.setTextColor(90,90,90);

    doc.text(
        "CONSULTANT",
        consultantTextX,
        consultantY + 4
    );

    // Consultant name
    doc.setFont("helvetica","bold");
    doc.setFontSize(18);
    doc.setTextColor(0,153,0);

    doc.text(
        meta.consultant || "CONSULTANT NAME",
        consultantTextX,
        consultantY + 16
    );

    // ---------- REVISION DATE ----------

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(90, 90, 90);

    doc.text(
        `Revision Date: ${meta.revisionDate || meta.date || ""}`,
        pageWidth - 20,
        pageHeight * layout.revisionY,
        { align: "right" }
    );  
}