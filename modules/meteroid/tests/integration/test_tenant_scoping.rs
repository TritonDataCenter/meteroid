//! A tenant must not read or change another tenant's rows by passing their ids.
//!
//! The seeded tenant (`TENANT_ID`) owns the targeted rows; a second tenant created in each test
//! plays the caller.

use crate::data::ids::{
    CUST_UBER_ID, INVOICING_ENTITY_ID, ORGANIZATION_ID, PLAN_VERSION_1_LEETCODE_ID, TENANT_ID,
};
use crate::helpers;
use crate::meteroid_it;
use crate::meteroid_it::container::{MeteroidSetup, SeedLevel};
use chrono::NaiveDate;
use common_domain::ids::{InvoicingEntityId, TenantId};
use diesel_models::plans::PlanRowForSubscription;
use meteroid_store::domain::accounting::{CustomTax, CustomTaxNew};
use meteroid_store::domain::enums::TenantEnvironmentEnum;
use meteroid_store::domain::tenants::TenantNew;
use meteroid_store::domain::{
    CreateSubscription, SubscriptionActivationCondition, SubscriptionNew,
};
use meteroid_store::errors::StoreError;
use meteroid_store::repositories::TenantInterface;
use meteroid_store::repositories::accounting::AccountingInterface;
use meteroid_store::repositories::invoicing_entities::InvoicingEntityInterfaceAuto;

/// A second tenant in the seeded organization, with its default invoicing entity.
async fn other_tenant(setup: &MeteroidSetup) -> (TenantId, InvoicingEntityId) {
    let tenant = setup
        .store
        .insert_tenant(
            TenantNew {
                name: "Other".to_string(),
                environment: TenantEnvironmentEnum::Development,
                disable_emails: None,
                invoicing_entity: None,
            },
            ORGANIZATION_ID,
        )
        .await
        .expect("other tenant");
    let entity = setup
        .store
        .get_invoicing_entity(tenant.id, None)
        .await
        .expect("other tenant invoicing entity");
    (tenant.id, entity.id)
}

/// A plan version resolves only within the tenant that owns it, and a subscription that names
/// another tenant's plan version is refused.
#[tokio::test]
async fn test_plan_version_of_other_tenant_is_not_found() {
    helpers::init::logging();
    let postgres_connection_string = meteroid_it::container::create_test_database().await;
    let setup =
        meteroid_it::container::start_meteroid(postgres_connection_string, SeedLevel::PLANS).await;
    let mut conn = setup.store.get_conn().await.unwrap();
    let (other, _) = other_tenant(&setup).await;

    let own = PlanRowForSubscription::get_plans_for_subscription_by_version_ids(
        &mut conn,
        TENANT_ID,
        vec![PLAN_VERSION_1_LEETCODE_ID],
    )
    .await
    .unwrap();
    assert_eq!(own.len(), 1);
    let foreign = PlanRowForSubscription::get_plans_for_subscription_by_version_ids(
        &mut conn,
        other,
        vec![PLAN_VERSION_1_LEETCODE_ID],
    )
    .await
    .unwrap();
    assert!(foreign.is_empty(), "another tenant's plan version resolved");

    let res = setup
        .services
        .insert_subscription(
            common_domain::actor::Actor::System,
            CreateSubscription {
                subscription: SubscriptionNew {
                    customer_id: CUST_UBER_ID,
                    plan_version_id: PLAN_VERSION_1_LEETCODE_ID,
                    net_terms: None,
                    invoice_memo: None,
                    invoice_threshold: None,
                    start_date: NaiveDate::from_ymd_opt(2024, 1, 1).unwrap(),
                    end_date: None,
                    billing_start_date: None,
                    activation_condition: SubscriptionActivationCondition::OnStart,
                    trial_duration: None,
                    billing_day_anchor: None,
                    payment_methods_config: None,
                    auto_advance_invoices: true,
                    charge_automatically: false,
                    purchase_order: None,
                    backdate_invoices: false,
                    skip_checkout_session: false,
                    skip_past_invoices: false,
                },
                price_components: None,
                add_ons: None,
                coupons: None,
                entitlements: vec![],
            },
            other,
        )
        .await;
    match res {
        Err(report) => assert!(
            matches!(
                report.current_context(),
                StoreError::ValueNotFound(message) if message.contains("Plan version not found")
            ),
            "expected the plan version to be not found, got {report:?}"
        ),
        Ok(_) => panic!("a subscription used another tenant's plan version"),
    }
}

#[tokio::test]
async fn test_update_custom_tax_of_other_tenant_is_not_found() {
    helpers::init::logging();
    let postgres_connection_string = meteroid_it::container::create_test_database().await;
    let setup =
        meteroid_it::container::start_meteroid(postgres_connection_string, SeedLevel::MINIMAL)
            .await;
    let store = &setup.store;
    let (other, other_entity) = other_tenant(&setup).await;

    let victim = store
        .insert_custom_tax(
            TENANT_ID,
            CustomTaxNew {
                invoicing_entity_id: INVOICING_ENTITY_ID,
                name: "Victim tax".to_string(),
                tax_code: "VICTIM".to_string(),
                rules: vec![],
            },
        )
        .await
        .expect("victim tax");

    let res = store
        .update_custom_tax(
            other,
            CustomTax {
                id: victim.id,
                invoicing_entity_id: other_entity,
                name: "Hijacked".to_string(),
                tax_code: "HIJACKED".to_string(),
                rules: vec![],
            },
        )
        .await;
    assert!(
        matches!(
            res.as_ref().map_err(|e| e.current_context()),
            Err(StoreError::ValueNotFound(_))
        ),
        "expected NotFound, got {res:?}"
    );

    let taxes = store
        .list_custom_taxes_by_invoicing_entity_id(TENANT_ID, INVOICING_ENTITY_ID)
        .await
        .expect("list victim taxes");
    let unchanged = taxes
        .iter()
        .find(|t| t.id == victim.id)
        .expect("victim tax");
    assert_eq!(unchanged.name, "Victim tax");
    assert_eq!(unchanged.tax_code, "VICTIM");

    let updated = store
        .update_custom_tax(
            TENANT_ID,
            CustomTax {
                name: "Renamed".to_string(),
                ..unchanged.clone()
            },
        )
        .await
        .expect("owner update");
    assert_eq!(updated.name, "Renamed");
}
