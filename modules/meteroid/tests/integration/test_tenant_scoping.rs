use crate::data::ids::{API_TOKEN_ID, PLAN_VERSION_1_LEETCODE_ID, TENANT_ID};
use crate::helpers;
use crate::meteroid_it;
use crate::meteroid_it::container::SeedLevel;
use common_domain::ids::{BaseId, TenantId};
use diesel_models::api_tokens::ApiTokenRow;
use diesel_models::plans::PlanRowForSubscription;
use meteroid_store::repositories::api_tokens::ApiTokensInterface;

/// Plan versions and API tokens resolve only within the tenant that owns them.
#[tokio::test]
async fn test_plan_versions_and_api_tokens_are_tenant_scoped() {
    helpers::init::logging();
    let postgres_connection_string = meteroid_it::container::create_test_database().await;
    let setup =
        meteroid_it::container::start_meteroid(postgres_connection_string, SeedLevel::PLANS).await;
    let mut conn = setup.store.get_conn().await.unwrap();
    let other = TenantId::new();

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

    assert!(
        ApiTokenRow::find_by_id(&mut conn, TENANT_ID, &API_TOKEN_ID)
            .await
            .is_ok()
    );
    assert!(
        ApiTokenRow::find_by_id(&mut conn, other, &API_TOKEN_ID)
            .await
            .is_err()
    );
    assert!(
        setup
            .store
            .get_api_token_by_id(other, &API_TOKEN_ID)
            .await
            .is_err(),
        "another tenant's token resolved through the store"
    );
}
