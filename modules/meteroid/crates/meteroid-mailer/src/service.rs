use crate::config::MailerConfig;
use crate::errors::MailerServiceError;
use crate::model::{
    Email, EmailValidationLink, InvoicePaid, InvoiceReady, OrgInvite, QuoteReady, RenderedEmail,
    ResetPasswordLink,
};
use crate::template::{
    EmailValidationLinkTemplate, InvoicePaidTemplate, InvoiceReadyTemplate, OrgInviteTemplate,
    QuoteReadyTemplate, ResetPasswordLinkTemplate,
};
use async_trait::async_trait;
use error_stack::Report;
use lettre::transport::smtp::authentication::Credentials;
use lettre::transport::stub::AsyncStubTransport;
use lettre::{AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor};
use sailfish::TemplateSimple;
use secrecy::ExposeSecret;
use std::sync::Arc;

#[cfg(feature = "test-utils")]
use mockall::automock;

#[cfg_attr(feature = "test-utils", automock)]
#[async_trait]
pub trait MailerService: Send + Sync {
    async fn send(&self, email: Email) -> Result<bool, Report<MailerServiceError>>;
    async fn send_reset_password_link(
        &self,
        link: ResetPasswordLink,
    ) -> Result<(), Report<MailerServiceError>>;

    async fn send_email_validation_link(
        &self,
        link: EmailValidationLink,
    ) -> Result<(), Report<MailerServiceError>>;

    async fn send_invoice_ready_for_payment(
        &self,
        link: InvoiceReady,
    ) -> Result<RenderedEmail, Report<MailerServiceError>>;

    async fn send_invoice_paid(
        &self,
        link: InvoicePaid,
    ) -> Result<RenderedEmail, Report<MailerServiceError>>;

    async fn send_quote_ready(
        &self,
        data: QuoteReady,
    ) -> Result<RenderedEmail, Report<MailerServiceError>>;

    async fn send_org_invite(&self, data: OrgInvite) -> Result<(), Report<MailerServiceError>>;
}

pub struct LettreMailerService<T: AsyncTransport> {
    pub transport: Arc<T>,
    pub config: MailerConfig,
}

#[async_trait]
impl<T: AsyncTransport + Send + Sync> MailerService for LettreMailerService<T>
where
    T::Error: Into<MailerServiceError>,
{
    async fn send(&self, email: Email) -> Result<bool, Report<MailerServiceError>> {
        if email
            .to
            .iter()
            .any(|r| r.email.ends_with(".test") || r.email.ends_with(".invalid"))
        {
            log::info!(
                "Skipping sending email to {} as it is a test email",
                email
                    .to
                    .iter()
                    .map(|r| r.email.as_str())
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            return Ok(false);
        }

        let message: Message = email.try_into()?;
        let _ = self
            .transport
            .send(message)
            .await
            .map_err(|e| Report::new(e.into()))?;

        Ok(true)
    }

    async fn send_reset_password_link(
        &self,
        link: ResetPasswordLink,
    ) -> Result<(), Report<MailerServiceError>> {
        let tpl = ResetPasswordLinkTemplate::from(link.clone());

        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;

        let email = Email {
            from: self.config.from.clone(),
            reply_to: Some(self.config.from.clone()),
            to: vec![link.recipient.clone()],
            subject: "Reset password".into(),
            body_html,
            attachments: vec![],
        };
        self.send(email).await.map(|_| ())
    }

    async fn send_email_validation_link(
        &self,
        link: EmailValidationLink,
    ) -> Result<(), Report<MailerServiceError>> {
        let tpl = EmailValidationLinkTemplate::from(link.clone()).tpl;

        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;

        let email = Email {
            from: self.config.from.clone(),
            reply_to: Some(self.config.from.clone()),
            to: vec![link.recipient.clone()],
            subject: "Confirm your email".into(),
            body_html,
            attachments: vec![],
        };
        self.send(email).await.map(|_| ())
    }

    async fn send_invoice_ready_for_payment(
        &self,
        data: InvoiceReady,
    ) -> Result<RenderedEmail, Report<MailerServiceError>> {
        let tpl = InvoiceReadyTemplate::from(data.clone()).tpl;
        let subject = tpl.title.clone();
        let from = self.config.from.clone();
        let reply_to = Some(self.config.from.clone());
        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;
        let recipients = data.recipients.clone();
        let attachment_filenames = vec![data.attachment.filename.clone()];

        let email = Email {
            from: from.clone(),
            reply_to: reply_to.clone(),
            to: recipients.clone(),
            subject: subject.clone(),
            body_html: body_html.clone(),
            attachments: vec![data.attachment],
        };
        let delivered = self.send(email).await?;
        Ok(RenderedEmail {
            subject,
            from,
            reply_to,
            recipients,
            body_html,
            attachment_filenames,
            delivered,
        })
    }

    async fn send_invoice_paid(
        &self,
        data: InvoicePaid,
    ) -> Result<RenderedEmail, Report<MailerServiceError>> {
        let tpl = InvoicePaidTemplate::from(data.clone()).tpl;
        let subject = tpl.title.clone();
        let from = self.config.from.clone();
        let reply_to = Some(self.config.from.clone());
        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;
        let recipients = data.recipients.clone();
        let attachment_filenames = data
            .attachments
            .iter()
            .map(|a| a.filename.clone())
            .collect();

        let email = Email {
            from: from.clone(),
            reply_to: reply_to.clone(),
            to: recipients.clone(),
            subject: subject.clone(),
            body_html: body_html.clone(),
            attachments: data.attachments,
        };
        let delivered = self.send(email).await?;
        Ok(RenderedEmail {
            subject,
            from,
            reply_to,
            recipients,
            body_html,
            attachment_filenames,
            delivered,
        })
    }

    async fn send_quote_ready(
        &self,
        data: QuoteReady,
    ) -> Result<RenderedEmail, Report<MailerServiceError>> {
        let tpl = QuoteReadyTemplate::from(data.clone()).tpl;
        let subject = tpl.title.clone();
        let from = self.config.from.clone();
        let reply_to = Some(self.config.from.clone());
        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;
        let recipients = data.recipients.clone();

        let email = Email {
            from: from.clone(),
            reply_to: reply_to.clone(),
            to: recipients.clone(),
            subject: subject.clone(),
            body_html: body_html.clone(),
            attachments: vec![],
        };
        let delivered = self.send(email).await?;
        Ok(RenderedEmail {
            subject,
            from,
            reply_to,
            recipients,
            body_html,
            attachment_filenames: vec![],
            delivered,
        })
    }

    async fn send_org_invite(&self, data: OrgInvite) -> Result<(), Report<MailerServiceError>> {
        let tpl = OrgInviteTemplate::from(data.clone()).tpl;
        let body_html = tpl.render_once().map_err(|e| Report::new(e.into()))?;
        let email = Email {
            from: self.config.from.clone(),
            reply_to: Some(self.config.from.clone()),
            to: vec![data.recipient],
            subject: format!("You've been invited to join {} on Meteroid", data.org_name),
            body_html,
            attachments: vec![],
        };
        self.send(email).await.map(|_| ())
    }
}

pub fn mailer_service(cfg: MailerConfig) -> Arc<dyn MailerService> {
    if let (Some(host), Some(username), Some(password)) = (
        cfg.smtp_host.as_ref(),
        cfg.smtp_username.as_ref(),
        cfg.smtp_password.as_ref(),
    ) {
        let creds = Credentials::new(
            username.expose_secret().to_string(),
            password.expose_secret().to_string(),
        );

        let transport = if cfg.smtp_tls {
            log::info!("Starting mailer service with TLS to host {host}");
            // TODO pool ?
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
                .unwrap()
                .credentials(creds)
                .timeout(Some(std::time::Duration::from_secs(10)))
                .build()
        } else {
            log::info!("Starting unsecure mailer service to host {host}");
            AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(host.to_string())
                .credentials(creds)
                .timeout(Some(std::time::Duration::from_secs(10)))
                .build()
        };

        Arc::new(LettreMailerService {
            transport: Arc::new(transport),
            config: cfg,
        })
    } else {
        Arc::new(LettreMailerService {
            transport: Arc::new(AsyncStubTransport::new_ok()),
            config: cfg,
        })
    }
}

#[cfg(test)]
mod tests {
    use crate::config::MailerConfig;
    use crate::model::{
        Email, EmailAttachment, EmailAttachmentType, EmailRecipient, EmailValidationLink,
        InvoicePaid, InvoiceReady, OrgInvite, QuoteReady, ResetPasswordLink,
    };
    use crate::service::{LettreMailerService, MailerService, mailer_service};
    use chrono::NaiveDate;
    use lettre::transport::stub::AsyncStubTransport;
    use secrecy::SecretString;
    use std::sync::Arc;

    #[tokio::test]
    async fn test_dummy() -> Result<(), Box<dyn std::error::Error>> {
        let cfg = MailerConfig::dummy();

        let pdf_data = vec![0; 8];

        let email = Email {
            from: "NoBody <hey@pp.com>".to_string(),
            reply_to: None,
            to: vec![EmailRecipient {
                email: "aa@g.com".into(),
                first_name: None,
                last_name: None,
            }],
            subject: "Happy new year buddy".to_string(),
            body_html: "Please find the attached PDF! \n".to_string(),
            attachments: vec![EmailAttachment {
                filename: "example.pdf".to_string(),
                content: pdf_data,
                type_: EmailAttachmentType::Pdf,
            }],
        };

        let srv = mailer_service(cfg);

        srv.send(email).await?;

        Ok(())
    }

    #[tokio::test]
    async fn all_email_types_use_the_configured_sender_and_reply_to()
    -> Result<(), Box<dyn std::error::Error>> {
        let configured_sender = "Configured Sender <sender@example.com>";
        let serialized_sender = "\"Configured Sender\" <sender@example.com>";
        let mut config = MailerConfig::dummy();
        config.from = configured_sender.to_string();

        let transport = Arc::new(AsyncStubTransport::new_ok());
        let service = LettreMailerService {
            transport: transport.clone(),
            config,
        };
        let recipient = || EmailRecipient {
            email: "recipient@example.com".into(),
            first_name: Some("Test".into()),
            last_name: Some("Recipient".into()),
        };
        let date = NaiveDate::from_ymd_opt(2026, 9, 24).unwrap();

        service
            .send_reset_password_link(ResetPasswordLink {
                url: SecretString::from("https://example.com/reset"),
                url_expires_in: chrono::Duration::hours(1),
                recipient: recipient(),
            })
            .await?;
        service
            .send_email_validation_link(EmailValidationLink {
                url: SecretString::from("https://example.com/validate"),
                url_expires_in: chrono::Duration::hours(1),
                recipient: recipient(),
            })
            .await?;

        let invoice_ready = service
            .send_invoice_ready_for_payment(InvoiceReady {
                invoice_number: "INV-001".into(),
                invoice_date: date,
                invoice_due_date: date,
                label: "Invoice".into(),
                amount_due: 1000,
                currency: "USD".into(),
                payment_url: "https://example.com/pay".into(),
                company_name: "Customer Company".into(),
                logo_url: None,
                recipients: vec![recipient()],
                attachment: EmailAttachment {
                    filename: "invoice.pdf".into(),
                    content: vec![0; 8],
                    type_: EmailAttachmentType::Pdf,
                },
                account: "account".into(),
            })
            .await?;
        let invoice_paid = service
            .send_invoice_paid(InvoicePaid {
                invoice_number: "INV-001".into(),
                invoice_date: date,
                invoice_due_date: date,
                label: "Invoice".into(),
                amount_paid: 1000,
                currency: "USD".into(),
                company_name: "Customer Company".into(),
                logo_url: None,
                recipients: vec![recipient()],
                attachments: vec![],
                lines: vec![],
                account: "account".into(),
            })
            .await?;
        let quote = service
            .send_quote_ready(QuoteReady {
                quote_number: "QUO-001".into(),
                expires_at: Some(date),
                company_name: "Customer Company".into(),
                logo_url: None,
                recipients: vec![recipient()],
                portal_url: "https://example.com/quote".into(),
                custom_message: None,
                account: "account".into(),
            })
            .await?;

        service
            .send_org_invite(OrgInvite {
                org_name: "Customer Company".into(),
                inviter_name: "Inviter".into(),
                role: "Admin".into(),
                invite_url: "https://example.com/invite".into(),
                expires_in: "1 day".into(),
                recipient: recipient(),
            })
            .await?;

        for rendered in [invoice_ready, invoice_paid, quote] {
            assert_eq!(rendered.from, configured_sender);
            assert_eq!(rendered.reply_to.as_deref(), Some(configured_sender));
        }

        let messages = transport.messages().await;
        assert_eq!(messages.len(), 6);
        for (_, message) in messages {
            assert!(
                message.contains(&format!("From: {serialized_sender}\r\n")),
                "message did not use the configured From header: {message}"
            );
            assert!(
                message.contains(&format!("Reply-To: {serialized_sender}\r\n")),
                "message did not use the configured Reply-To header: {message}"
            );
            assert!(!message.contains("@meteroid.com"));
        }

        Ok(())
    }
}
