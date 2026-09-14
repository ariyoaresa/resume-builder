import { useCallback, useEffect, useState } from 'react';
import { StyledButton } from '../atoms';
import { MenuItem, Menu, CircularProgress } from '@mui/material';
import { useResumeStore } from '@/stores/useResumeStore';
import { generateDocx } from '@/helpers/utils/generateDocx';
import { generatePdf } from '@/helpers/utils/generatePdf';
import React from 'react';

export const PrintResume: React.FC<{ isMenuButton?: boolean }> = ({ isMenuButton }) => {
  const resumeData = useResumeStore();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);
  const isExporting = isExportingPdf || isExportingDocx;
  const open = Boolean(anchorEl) && !isExporting;

  useEffect(() => {
    if (isExporting) {
      setAnchorEl(null);
    }
  }, [isExporting]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => {
    setAnchorEl(null);
  };

  const downloadPdf = useCallback(async () => {
    handleClose();
    setIsExportingPdf(true);
    try {
      await generatePdf(resumeData.basics.name);
    } catch (error) {
      console.error('Direct PDF export error:', error);
      alert('Unable to export PDF directly. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [resumeData.basics.name]);

  const downloadDocx = useCallback(async () => {
    handleClose();
    setIsExportingDocx(true);
    try {
      await generateDocx(resumeData);
    } catch (error) {
      console.error('Direct DOCX export error:', error);
      alert('Unable to export DOCX directly. Please try again.');
    } finally {
      setIsExportingDocx(false);
    }
  }, [resumeData]);

  if (isMenuButton) {
    return (
      <>
        <MenuItem onClick={downloadPdf} disabled={isExporting}>
          {isExportingPdf ? 'Generating PDF...' : 'Download as PDF'}
        </MenuItem>
        <MenuItem onClick={downloadDocx} disabled={isExporting}>
          {isExportingDocx ? 'Generating DOCX...' : 'Download as DOCX'}
        </MenuItem>
      </>
    );
  }

  return (
    <div>
      <StyledButton
        id="download-button"
        aria-controls={open ? 'download-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
        onClick={handleClick}
        variant="outlined"
        disabled={isExporting}
      >
        {isExporting ? (
          <span className="flex items-center gap-2">
            <CircularProgress size={16} color="inherit" />
            <span>Exporting...</span>
          </span>
        ) : (
          'Download'
        )}
      </StyledButton>
      <Menu
        id="download-menu"
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        MenuListProps={{
          'aria-labelledby': 'download-button',
        }}
      >
        <MenuItem onClick={downloadPdf} disabled={isExporting}>
          {isExportingPdf ? 'Generating PDF...' : 'Download as PDF'}
        </MenuItem>
        <MenuItem onClick={downloadDocx} disabled={isExporting}>
          {isExportingDocx ? 'Generating DOCX...' : 'Download as DOCX'}
        </MenuItem>
      </Menu>
    </div>
  );
};
