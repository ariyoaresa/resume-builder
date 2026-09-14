import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  UnderlineType,
  convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import {
  IResume,
  IWorkIntrf,
  IEducation,
  IItem,
  IAwards,
  IVolunteer,
} from '@/stores/index.interface';
import { dateParser, formatExportFileName } from './index';

interface TextFormatOptions {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
  color?: string;
  size?: number;
}

/**
 * Parses inline DOM nodes into docx TextRun objects, preserving bold, italics, underline, links, and line breaks.
 */
const parseInlineNodes = (node: Node, options: TextFormatOptions = {}): TextRun[] => {
  const runs: TextRun[] = [];

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];

    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent;
      if (text) {
        runs.push(
          new TextRun({
            text,
            bold: options.bold,
            italics: options.italics,
            underline: options.underline ? { type: UnderlineType.SINGLE } : undefined,
            color: options.color || '333333',
            size: options.size || 20, // 10pt (half-points)
            font: 'Calibri',
          })
        );
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as HTMLElement;
      const tagName = element.tagName.toUpperCase();

      if (tagName === 'BR') {
        runs.push(new TextRun({ break: 1 }));
        continue;
      }

      const nextOptions: TextFormatOptions = {
        ...options,
        bold: options.bold || tagName === 'STRONG' || tagName === 'B',
        italics: options.italics || tagName === 'EM' || tagName === 'I',
        underline: options.underline || tagName === 'U',
      };

      if (tagName === 'A') {
        nextOptions.underline = true;
        nextOptions.color = '2563EB';
      }

      runs.push(...parseInlineNodes(element, nextOptions));
    }
  }

  return runs;
};

/**
 * Converts an HTML string (from Jodit rich text editor) into formatted docx Paragraph objects.
 * Handles paragraphs, unordered lists (bullets), ordered lists, and inline styles.
 */
export const htmlToDocxParagraphs = (html: string | undefined | null): Paragraph[] => {
  if (!html || !html.trim() || html.trim() === '<p></p>' || html.trim() === '<p><br></p>') {
    return [];
  }

  // Fallback for non-browser environments if any
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    const stripped = html.replace(/<[^>]*>?/gm, '').replace(/&nbsp;/g, ' ');
    return stripped.trim()
      ? [
          new Paragraph({
            children: [new TextRun({ text: stripped, size: 20, font: 'Calibri' })],
            spacing: { after: 100 },
          }),
        ]
      : [];
  }

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, 'text/html');
  const paragraphs: Paragraph[] = [];

  const processNode = (node: Node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toUpperCase();

    if (tagName === 'UL' || tagName === 'OL') {
      for (let i = 0; i < element.children.length; i++) {
        const li = element.children[i];
        if (li.tagName.toUpperCase() === 'LI') {
          const runs = parseInlineNodes(li);
          if (runs.length > 0) {
            paragraphs.push(
              new Paragraph({
                bullet: { level: 0 },
                children: runs,
                spacing: { after: 60, line: 260 },
              })
            );
          }
        }
      }
    } else if (
      tagName === 'P' ||
      tagName === 'DIV' ||
      tagName === 'H1' ||
      tagName === 'H2' ||
      tagName === 'H3' ||
      tagName === 'H4'
    ) {
      const runs = parseInlineNodes(element);
      if (runs.length > 0) {
        paragraphs.push(
          new Paragraph({
            children: runs,
            spacing: { after: 100, line: 260 },
          })
        );
      }
    } else if (tagName === 'LI') {
      const runs = parseInlineNodes(element);
      if (runs.length > 0) {
        paragraphs.push(
          new Paragraph({
            bullet: { level: 0 },
            children: runs,
            spacing: { after: 60, line: 260 },
          })
        );
      }
    } else {
      // Process child nodes
      for (let i = 0; i < element.childNodes.length; i++) {
        processNode(element.childNodes[i]);
      }
    }
  };

  for (let i = 0; i < parsedDoc.body.childNodes.length; i++) {
    const child = parsedDoc.body.childNodes[i];
    if (child.nodeType === Node.TEXT_NODE && child.textContent?.trim()) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: child.textContent.trim(),
              size: 20,
              font: 'Calibri',
            }),
          ],
          spacing: { after: 100 },
        })
      );
    } else {
      processNode(child);
    }
  }

  return paragraphs;
};

/**
 * Creates a standard styled section header with bottom border divider.
 */
const createSectionHeading = (title: string): Paragraph => {
  return new Paragraph({
    text: title.toUpperCase(),
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 200, after: 80 },
    border: {
      bottom: {
        color: '94A3B8',
        space: 4,
        style: BorderStyle.SINGLE,
        size: 8,
      },
    },
  });
};

export const generateDocx = async (resumeData: IResume) => {
  const { basics, work, education, skills, awards, volunteer, activities } = resumeData;

  // Header contact line elements
  const contactParts: string[] = [];
  if (basics.email) contactParts.push(basics.email);
  if (basics.phone) contactParts.push(basics.phone);
  if (basics.url) contactParts.push(basics.url);

  const locationParts: string[] = [];
  if (basics.location?.city) locationParts.push(basics.location.city);
  if (basics.location?.region) locationParts.push(basics.location.region);
  if (basics.location?.countryCode) locationParts.push(basics.location.countryCode);
  if (basics.location?.postalCode) locationParts.push(basics.location.postalCode);
  if (locationParts.length > 0) {
    contactParts.push(locationParts.join(', '));
  }

  const profilesLine =
    basics.profiles && basics.profiles.length > 0
      ? basics.profiles
          .filter((p) => p.network || p.url)
          .map((p) => `${p.network}: ${p.url || p.username}`)
          .join(' | ')
      : '';

  // Summary and Objective sections
  const summaryParagraphs = htmlToDocxParagraphs(basics.summary);
  const objectiveParagraphs = htmlToDocxParagraphs(basics.objective);

  // Work Experience section
  const workParagraphs: Paragraph[] = [];
  if (work && work.length > 0) {
    work.forEach((exp: IWorkIntrf) => {
      if (!exp.name && !exp.position) return;

      const dateStr = `${dateParser(exp.startDate) || ''} - ${
        exp.isWorkingHere ? 'Present' : dateParser(exp.endDate) || ''
      }`;

      workParagraphs.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({ text: exp.name, bold: true, size: 22, font: 'Calibri' }),
            new TextRun({
              text: exp.position ? ` — ${exp.position}` : '',
              italics: true,
              size: 22,
              font: 'Calibri',
            }),
            new TextRun({
              text: dateStr.trim() !== '-' ? `  (${dateStr})` : '',
              size: 18,
              color: '64748B',
              font: 'Calibri',
            }),
          ],
        })
      );

      const expBody = htmlToDocxParagraphs(exp.summary);
      workParagraphs.push(...expBody);

      if (exp.highlights && exp.highlights.length > 0) {
        exp.highlights.forEach((h: string) => {
          if (h && h.trim()) {
            workParagraphs.push(
              new Paragraph({
                bullet: { level: 0 },
                children: [new TextRun({ text: h.trim(), size: 20, font: 'Calibri' })],
                spacing: { after: 40 },
              })
            );
          }
        });
      }
    });
  }

  // Education section
  const educationParagraphs: Paragraph[] = [];
  if (education && education.length > 0) {
    education.forEach((edu: IEducation) => {
      if (!edu.institution && !edu.studyType && !edu.area) return;

      const dateStr = `${dateParser(edu.startDate) || ''} - ${
        edu.isStudyingHere ? 'Present' : dateParser(edu.endDate) || ''
      }`;

      const degreeStr = [edu.studyType, edu.area].filter(Boolean).join(' in ');

      educationParagraphs.push(
        new Paragraph({
          spacing: { before: 100, after: 40 },
          children: [
            new TextRun({ text: edu.institution, bold: true, size: 22, font: 'Calibri' }),
            new TextRun({
              text: degreeStr ? ` — ${degreeStr}` : '',
              italics: true,
              size: 22,
              font: 'Calibri',
            }),
            new TextRun({
              text: dateStr.trim() !== '-' ? `  (${dateStr})` : '',
              size: 18,
              color: '64748B',
              font: 'Calibri',
            }),
          ],
        })
      );

      if (edu.score) {
        educationParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Score/GPA: ', bold: true, size: 20, font: 'Calibri' }),
              new TextRun({ text: edu.score, size: 20, font: 'Calibri' }),
            ],
            spacing: { after: 60 },
          })
        );
      }

      if (edu.courses && edu.courses.length > 0) {
        educationParagraphs.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'Relevant Courses: ', bold: true, size: 20, font: 'Calibri' }),
              new TextRun({ text: edu.courses.join(', '), size: 20, font: 'Calibri' }),
            ],
            spacing: { after: 60 },
          })
        );
      }
    });
  }

  // Skills section
  const skillsParagraphs: Paragraph[] = [];
  if (skills) {
    const addSkillCategory = (title: string, items: IItem[]) => {
      if (items && items.length > 0) {
        skillsParagraphs.push(
          new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: `${title}: `, bold: true, size: 20, font: 'Calibri' }),
              new TextRun({
                text: items.map((s: IItem) => s.name).join(', '),
                size: 20,
                font: 'Calibri',
              }),
            ],
          })
        );
      }
    };

    addSkillCategory('Languages', skills.languages);
    addSkillCategory('Frameworks & Technologies', [
      ...(skills.frameworks || []),
      ...(skills.technologies || []),
    ]);
    addSkillCategory('Libraries & Databases', [
      ...(skills.libraries || []),
      ...(skills.databases || []),
    ]);
    addSkillCategory('Tools & Practices', [...(skills.tools || []), ...(skills.practices || [])]);
  }

  // Awards section
  const awardsParagraphs: Paragraph[] = [];
  if (awards && awards.length > 0) {
    awards.forEach((award: IAwards) => {
      if (!award.title && !award.awarder) return;

      const dateStr = dateParser(award.date) || '';
      awardsParagraphs.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({ text: award.title, bold: true, size: 21, font: 'Calibri' }),
            new TextRun({
              text: award.awarder ? ` — ${award.awarder}` : '',
              italics: true,
              size: 21,
              font: 'Calibri',
            }),
            new TextRun({
              text: dateStr ? `  (${dateStr})` : '',
              size: 18,
              color: '64748B',
              font: 'Calibri',
            }),
          ],
        })
      );

      const awardBody = htmlToDocxParagraphs(award.summary);
      awardsParagraphs.push(...awardBody);
    });
  }

  // Volunteering section
  const volunteerParagraphs: Paragraph[] = [];
  if (volunteer && volunteer.length > 0) {
    volunteer.forEach((vol: IVolunteer) => {
      if (!vol.organization && !vol.position) return;

      const dateStr = `${dateParser(vol.startDate) || ''} - ${
        vol.isVolunteeringNow ? 'Present' : dateParser(vol.endDate) || ''
      }`;

      volunteerParagraphs.push(
        new Paragraph({
          spacing: { before: 80, after: 40 },
          children: [
            new TextRun({ text: vol.organization, bold: true, size: 21, font: 'Calibri' }),
            new TextRun({
              text: vol.position ? ` — ${vol.position}` : '',
              italics: true,
              size: 21,
              font: 'Calibri',
            }),
            new TextRun({
              text: dateStr.trim() !== '-' ? `  (${dateStr})` : '',
              size: 18,
              color: '64748B',
              font: 'Calibri',
            }),
          ],
        })
      );

      const volBody = htmlToDocxParagraphs(vol.summary);
      volunteerParagraphs.push(...volBody);
    });
  }

  // Activities section
  const activityParagraphs: Paragraph[] = [];
  if (activities) {
    if (activities.involvements) {
      const invBody = htmlToDocxParagraphs(activities.involvements);
      if (invBody.length > 0) {
        activityParagraphs.push(
          new Paragraph({
            text: 'Key Involvements',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 80, after: 40 },
          })
        );
        activityParagraphs.push(...invBody);
      }
    }

    if (activities.achievements) {
      const achBody = htmlToDocxParagraphs(activities.achievements);
      if (achBody.length > 0) {
        activityParagraphs.push(
          new Paragraph({
            text: 'Key Achievements',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 80, after: 40 },
          })
        );
        activityParagraphs.push(...achBody);
      }
    }
  }

  // Assemble the complete document
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: 'Calibri',
            size: 20,
            color: '1E293B',
          },
        },
        heading1: {
          run: {
            font: 'Calibri',
            size: 36, // 18pt
            bold: true,
            color: '0F172A',
          },
        },
        heading2: {
          run: {
            font: 'Calibri',
            size: 24, // 12pt
            bold: true,
            color: '1E3A8A',
          },
        },
        heading3: {
          run: {
            font: 'Calibri',
            size: 21, // 10.5pt
            bold: true,
            color: '334155',
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.75),
              bottom: convertInchesToTwip(0.75),
              left: convertInchesToTwip(0.75),
              right: convertInchesToTwip(0.75),
            },
          },
        },
        children: [
          // Header: Name
          new Paragraph({
            text: basics.name || 'Your Name',
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 40 },
          }),

          // Header: Label / Title
          ...(basics.label
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: basics.label,
                      size: 24,
                      color: '475569',
                      font: 'Calibri',
                    }),
                  ],
                  spacing: { after: 60 },
                }),
              ]
            : []),

          // Header: Contact Info
          ...(contactParts.length > 0
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: contactParts.join('  |  '),
                      size: 18,
                      color: '475569',
                      font: 'Calibri',
                    }),
                  ],
                  spacing: { after: profilesLine ? 30 : 120 },
                }),
              ]
            : []),

          // Header: Profiles
          ...(profilesLine
            ? [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({
                      text: profilesLine,
                      size: 18,
                      color: '2563EB',
                      font: 'Calibri',
                    }),
                  ],
                  spacing: { after: 120 },
                }),
              ]
            : []),

          // Professional Summary
          ...(summaryParagraphs.length > 0
            ? [createSectionHeading('Professional Summary'), ...summaryParagraphs]
            : []),

          // Career Objective
          ...(objectiveParagraphs.length > 0
            ? [createSectionHeading('Career Objective'), ...objectiveParagraphs]
            : []),

          // Work Experience
          ...(workParagraphs.length > 0
            ? [createSectionHeading('Work Experience'), ...workParagraphs]
            : []),

          // Education
          ...(educationParagraphs.length > 0
            ? [createSectionHeading('Education'), ...educationParagraphs]
            : []),

          // Skills
          ...(skillsParagraphs.length > 0
            ? [createSectionHeading('Skills'), ...skillsParagraphs]
            : []),

          // Awards
          ...(awardsParagraphs.length > 0
            ? [createSectionHeading('Awards & Honors'), ...awardsParagraphs]
            : []),

          // Volunteering
          ...(volunteerParagraphs.length > 0
            ? [createSectionHeading('Volunteering & Leadership'), ...volunteerParagraphs]
            : []),

          // Activities
          ...(activityParagraphs.length > 0
            ? [createSectionHeading('Activities & Achievements'), ...activityParagraphs]
            : []),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = formatExportFileName(basics.name ? `Resume_${basics.name}` : 'Resume', 'docx');
  saveAs(blob, fileName);
};
