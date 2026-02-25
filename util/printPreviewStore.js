let lastPreview = null;

export const setPrintPreview = (data) => {
	lastPreview = data || null;
};

export const getPrintPreview = () => lastPreview;

export const clearPrintPreview = () => {
	lastPreview = null;
};
